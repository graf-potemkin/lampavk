function VKVideoScraperSource(component, _object) {
    var network = new Lampa.Reguest();
    var currentSearchObject = _object; 
    var self = this; 

    function log(message) {
        console.log("VKVideoScraperSource:", message);
    }

    this.getStreams = function (videoPageUrl, onsuccess, onerror) {
        log("Attempting to get streams for: " + videoPageUrl);
        component.loading(true);

        network.native(videoPageUrl, function (htmlMainPage) {
            var videoExtUrl = parseVideoExtUrl(htmlMainPage);
            if (!videoExtUrl) {
                log("Could not find video_ext.php URL on main page: " + videoPageUrl);
                Lampa.Noty.show("VK Scraper: Ошибка - не удалось найти ссылку на плеер.");
                component.loading(false);
                if (onerror) onerror();
                return;
            }
            log("Found video_ext.php URL: " + videoExtUrl);

            network.native(videoExtUrl, function (htmlPlayerPage) {
                var streams = parseStreamsFromPlayerPage(htmlPlayerPage);
                component.loading(false);
                if (streams && Object.keys(streams).length > 0) {
                    log("Successfully extracted streams: " + JSON.stringify(streams));
                    if (onsuccess) onsuccess(streams);
                } else {
                    log("Could not extract streams from player page: " + videoExtUrl);
                    Lampa.Noty.show("VK Scraper: Ошибка - не удалось извлечь видеопотоки.");
                    if (onerror) onerror();
                }
            }, function (xhr, status, error) {
                log("Error fetching video_ext.php page (" + videoExtUrl + "): " + status + " " + error);
                Lampa.Noty.show("VK Scraper: Ошибка загрузки страницы плеера.");
                component.loading(false);
                if (onerror) onerror();
            }, false, { dataType: "text" });

        }, function (xhr, status, error) {
            log("Error fetching main video page (" + videoPageUrl + "): " + status + " " + error);
            Lampa.Noty.show("VK Scraper: Ошибка загрузки основной страницы видео.");
            component.loading(false);
            if (onerror) onerror();
        }, false, { dataType: "text" });
    };

    function parseVideoExtUrl(html) {
        try {
            const ogVideoRegex = /<meta\s+property="og:video"\s+content="([^"<>]+)"/i;
            const match = html.match(ogVideoRegex);
            if (match && match[1]) {
                return match[1].replace(/&amp;/g, '&');
            }
        } catch (e) {
            log("Error parsing video_ext_url: " + e.message);
        }
        return null;
    }

    function parseStreamsFromPlayerPage(html) {
        var streams = {};
        try {
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
            let scriptMatch;
            while ((scriptMatch = scriptRegex.exec(html)) !== null) {
                const scriptContent = scriptMatch[1];
                const jsonRegex = /(?:playerParams|mvData|player_vars|VideoPlayer\._initParams)\s*[:=]\s*(\{[\s\S]*?\});/i;
                const paramsMatch = scriptContent.match(jsonRegex);
                if (paramsMatch && paramsMatch[1]) {
                    try {
                        const playerData = JSON.parse(paramsMatch[1]);
                        if (playerData.urls) {
                            for (const q in playerData.urls) {
                                if (playerData.urls[q] && typeof playerData.urls[q] === "string") {
                                    streams[q.replace("url","")] = playerData.urls[q].replace(/\\\//g, "/");
                                }
                            }
                        }
                        if (playerData.sources) {
                             if (Array.isArray(playerData.sources)) {
                                playerData.sources.forEach(function(source) {
                                    if (source.src && source.type && (source.type.includes("mp4") || source.type.includes("mpegurl"))) {
                                        let qualityLabel = source.label || (source.type.includes("mpegurl") ? "hls" : "auto");
                                        streams[qualityLabel] = source.src.replace(/\\\//g, "/");
                                    }
                                });
                            } else {
                                for (const q in playerData.sources) {
                                    if (typeof playerData.sources[q] === "string" && (playerData.sources[q].includes(".mp4") || playerData.sources[q].includes(".m3u8"))) {
                                         streams[q] = playerData.sources[q].replace(/\\\//g, "/");
                                    }
                                }
                            }
                        }
                        if (playerData.hls) streams["hls"] = playerData.hls.replace(/\\\//g, "/");
                        if (playerData.dash) streams["dash"] = playerData.dash.replace(/\\\//g, "/");
                        if (playerData.metadata && playerData.metadata.videos && playerData.metadata.videos.length > 0) {
                            playerData.metadata.videos.forEach(v => {
                                if (v.url) streams[v.name || "auto_"+Object.keys(streams).length] = v.url.replace(/\\\//g, "/");
                            });
                        }
                        if (playerData.player && playerData.player.playlist && playerData.player.playlist.length > 0 && playerData.player.playlist[0].sources) {
                            for(const q in playerData.player.playlist[0].sources) {
                                 if(typeof playerData.player.playlist[0].sources[q] === 'string') {
                                    streams[q] = playerData.player.playlist[0].sources[q].replace(/\\\//g, "/");
                                 }
                            }
                        }

                        if (Object.keys(streams).length > 0) break; 
                    } catch (e) { log("Error parsing JSON from script: " + e.message); }
                }
            }

            if (Object.keys(streams).length === 0) {
                log("No JSON player params found, trying regex for MP4/M3U8.");
                const streamRegex = /"(?:url|src|mp4|hls)[_]?(\d{3,4}|[a-zA-Z]+)?"\s*:\s*"((?:https?:)?\/\/[^"\s]+\.(?:mp4|m3u8)(?:\?[^"\s]*)?)"/gi;
                let streamMatch;
                while ((streamMatch = streamRegex.exec(html)) !== null) {
                    const qualityLabel = streamMatch[1] ? streamMatch[1].replace("url","") : (streamMatch[2].includes("m3u8") ? "hls" : "auto");
                    streams[qualityLabel] = streamMatch[2].replace(/\\\//g, "/").replace(/&amp;/g, '&');
                }
                 if (Object.keys(streams).length === 0) { 
                     const genericStreamRegex = /"((?:https?:)?\/\/[^"\s]+\.(?:mp4|m3u8)(?:\?[^"\s]*)?)"/gi;
                     while ((streamMatch = genericStreamRegex.exec(html)) !== null) {
                        let streamUrl = streamMatch[1].replace(/\\\//g, "/").replace(/&amp;/g, '&');
                        let quality = streamUrl.includes("m3u8") ? "hls_" : "auto_";
                        if (!streams[quality.slice(0,-1)]) streams[quality.slice(0,-1)] = streamUrl;
                        else streams[quality + Object.keys(streams).length] = streamUrl;
                     }
                }
            }

        } catch (e) {
            log("Error during stream parsing from player page: " + e.message);
        }
        return streams;
    }

    this.search = function (searchObject, kinopoisk_id_or_data) {
        currentSearchObject = searchObject;
        log("Search called for: " + currentSearchObject.movie.title);
        component.loading(true);

        var exampleVideoPageUrl = "https://vkvideo.ru/video-185913826_456241306";
        var displayTitle = currentSearchObject.movie.title + " (VK Scraper - Пример)";

        Lampa.Noty.show("VK Scraper: Попытка загрузки для примера '" + currentSearchObject.movie.title + "'. Используется тестовый URL.");

        var item = Lampa.Template.get("online", { 
            title: displayTitle,
            info: "Прямой парсинг vkvideo.ru (тестовый URL)"
        });
        item.addClass("video--stream"); 

        item.on("hover:enter", function () {
            if (item.hasClass('loading')) return;
            item.addClass('loading');

            self.getStreams(exampleVideoPageUrl,
                function(streams) { 
                    item.removeClass('loading');
                    if (streams && Object.keys(streams).length > 0) {
                        var streamUrlToPlay = streams["auto"] || streams["hls"] || streams[Object.keys(streams)[0]];
                        if (streamUrlToPlay) {
                            var playData = {
                                title: displayTitle,
                                url: streamUrlToPlay,
                                quality: streams 
                            };
                            if (currentSearchObject.movie.id) Lampa.Favorite.add('history', currentSearchObject.movie, 100);
                            Lampa.Player.play(playData);
                        } else {
                            Lampa.Noty.show("VK Scraper: Не удалось выбрать поток для воспроизведения.");
                        }
                    } 
                },
                function() { 
                    item.removeClass('loading');
                }
            );
        });

        component.reset(); 
        component.append(item);
        component.start(true); 
        component.loading(false);
    };

    this.reset = function () {
        log("Reset called");
    };

    this.filter = function (type, a, b) {
        log("Filter called - not implemented for VK Scraper");
        Lampa.Noty.show("VK Scraper: Фильтры не поддерживаются.");
    };

    this.destroy = function () {
        log("Destroy called");
        network.clear(); 
    };

    this.settings = function () {
        log("Settings called - not implemented for VK Scraper");
        Lampa.Noty.show("VK Scraper: Настройки не предусмотрены.");
    };

    log("VKVideoScraperSource (for online_mod) Initialized.");
}

