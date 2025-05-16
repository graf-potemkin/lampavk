// Lampa VK Video Source Module
// Version: 0.0.5
// Date: 2025-05-16
// Changes:
// - Persist user's quality choice in Lampa.Storage.
// - Ensure this.reset correctly resets quality choice to "auto" in storage and memory.
// - Added more explicit logging for stream selection fallback.

(function () {
    "use strict";

    function LampaVKVideoSource(component, _object) {
        // --- Initialization --- //
        var network = new Lampa.Reguest();
        var settings = Lampa.Storage.get("vk_auth_data", {});
        var currentObject = _object;
        var searchResults = [];
        var extractedStreams = {}; 
        var choice = {
            quality: Lampa.Storage.get("vk_default_quality", "auto"),
        };
        var filterItems = {
            quality: [],
        };

        // --- Constants --- //
        const VK_API_VERSION = "5.199";
        const CLIENT_ID = "YOUR_VK_APP_ID"; // CRITICAL: MUST BE REPLACED BY THE DEVELOPER
        const REDIRECT_URI = "YOUR_LAMPA_REDIRECT_URI"; // CRITICAL: MUST BE REPLACED BY THE DEVELOPER
        const TOKEN_URL = "https://oauth.vk.com/access_token";
        const AUTH_URL_BASE = "https://oauth.vk.com/authorize";
        const STREAM_CACHE_DURATION = 5 * 60 * 1000; 

        function log(message) {
            console.log("LampaVKVideoSource:", message);
        }

        log("Module initialized. Default quality: " + choice.quality);

        // PKCE Helper Functions (Placeholders - same as v0.0.2)
        async function generateCodeVerifier() {
            const randomString = Array(64).fill(null).map(() => Math.random().toString(36).charAt(2)).join("");
            Lampa.Storage.set("vk_code_verifier", randomString);
            return randomString;
        }
        async function generateCodeChallenge(verifier) {
            log("PKCE: SHA256 and Base64URL encoding needed for code_challenge from verifier.");
            return verifier; 
        }

        // --- Core Lampa Interface Methods ---
        this.search = function (searchObject, data) {
            log("Search called for: " + searchObject.movie.title);
            currentObject = searchObject;
            component.loading(true);

            checkAuth(function (isAuthenticated) {
                if (isAuthenticated) {
                    log("User is authenticated. Proceeding with search.");
                    performSearchVK(searchObject.movie.title, searchObject.movie.year, searchObject.movie.type);
                } else {
                    log("User is NOT authenticated. Suggesting auth via settings.");
                    component.loading(false);
                    component.empty();
                    Lampa.Noty.show("Для поиска в VK необходимо авторизоваться. Перейдите в настройки источника.");
                }
            });
        };

        this.reset = function () {
            log("Reset called. Resetting quality to auto.");
            Lampa.Storage.set("vk_default_quality", "auto"); // Reset stored default
            choice.quality = "auto"; // Reset in-memory choice
            
            buildFilters(); 
            applyFiltersAndDisplay();
            Lampa.Noty.show("Фильтры сброшены. Качество по умолчанию: Авто.");
        };

        this.filter = function (type, a, b) {
            log("Filter called - Type: " + type + ", Filter object 'a': " + JSON.stringify(a) + ", Selected item 'b': " + JSON.stringify(b));
            
            if (a.stype && b.value !== undefined) {
                choice[a.stype] = b.value;
                if (a.stype === 'quality') {
                    Lampa.Storage.set("vk_default_quality", b.value); // Persist selected quality
                    log("Quality choice updated and persisted: " + b.value);
                }
            } else {
                log("Warning: Filter item 'b' did not have a 'value' property. Check Lampa's filter data structure.");
                // Fallback or alternative handling if b.value is not the primary way Lampa passes selection
                if (a.stype && b.index !== undefined && filterItems[a.stype] && filterItems[a.stype][b.index]) {
                    var selectedFilterValue = filterItems[a.stype][b.index].value;
                    choice[a.stype] = selectedFilterValue;
                     if (a.stype === 'quality') {
                        Lampa.Storage.set("vk_default_quality", selectedFilterValue);
                        log("Quality choice updated (via index) and persisted: " + selectedFilterValue);
                    }
                } else {
                    log("Could not determine selected filter value from 'b'.");
                }
            }
            applyFiltersAndDisplay();
        };

        this.destroy = function () {
            log("Destroy called");
            network.clear();
            searchResults = [];
            extractedStreams = {};
        };
        
        this.settings = function() {
            log("Settings accessed");
            checkAuth(function(isAuthenticated) {
                var options = [];
                if (isAuthenticated) {
                    options.push({ title: "Выйти из VK", action: "logout" });
                    options.push({ title: "Обновить токен VK", action: "refresh" });
                    Lampa.Noty.show("Вы авторизованы в VK. User ID: " + settings.user_id);
                } else {
                    options.push({ title: "Войти через VK", action: "login" });
                }

                Lampa.Select.show({
                    title: "Настройки VK Video",
                    items: options,
                    onSelect: function (item) {
                        if (item.action === "login") {
                            initiateAuth(function(success) {
                                if (success) Lampa.Noty.show("Авторизация прошла успешно!");
                                else Lampa.Noty.show("Ошибка авторизации.");
                            });
                        } else if (item.action === "logout") {
                            clearAuthData();
                        } else if (item.action === "refresh") {
                            refreshToken(function(success) {
                                if (success) Lampa.Noty.show("Токен успешно обновлен.");
                                else Lampa.Noty.show("Ошибка обновления токена.");
                            });
                        } 
                        Lampa.Controller.toggle("settings");
                    },
                    onBack: function () {
                        Lampa.Controller.toggle("settings");
                    }
                });
            });
        };

        // -- Authentication Section (largely same as v0.0.3) -- //
        function checkAuth(callback) {
            log("Checking authentication...");
            settings = Lampa.Storage.get("vk_auth_data", {});
            var storedToken = settings.access_token;
            var expiresAt = settings.expires_at;
            if (storedToken && expiresAt && Date.now() < expiresAt) {
                callback(true);
            } else if (settings.refresh_token) {
                refreshToken(callback);
            } else {
                callback(false);
            }
        }

        async function initiateAuth(callbackAfterTokenExchange) {
            log("Initiating OAuth2 authentication...");
            if (CLIENT_ID === "YOUR_VK_APP_ID" || REDIRECT_URI === "YOUR_LAMPA_REDIRECT_URI") {
                Lampa.Noty.show("Критическая ошибка: CLIENT_ID или REDIRECT_URI не настроены в коде модуля! Пожалуйста, обратитесь к разработчику модуля.", 10000);
                log("CRITICAL: CLIENT_ID or REDIRECT_URI not configured!");
                if(callbackAfterTokenExchange) callbackAfterTokenExchange(false); return;
            }
            const state = generateState();
            var authUrl = AUTH_URL_BASE + "?" + "client_id=" + CLIENT_ID + "&display=page" +
                "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) + "&scope=video,offline" +
                "&response_type=code" + "&v=" + VK_API_VERSION + "&state=" + state;
            log("Auth URL: " + authUrl);
            Lampa.Noty.show("Перенаправление на страницу авторизации VK...");
            var code = prompt("Для авторизации:\n1. Перейдите по URL (скопируйте из консоли разработчика).\n2. Разрешите доступ.\n3. Вас перенаправит на REDIRECT_URI с параметром 'code' в адресной строке.\n4. Скопируйте значение параметра 'code' и вставьте сюда:", "");
            if (code) {
                handleAuthCallback("?code=" + code + "&state=" + state, callbackAfterTokenExchange);
            } else {
                Lampa.Noty.show("Авторизация отменена или не удалась.");
                if(callbackAfterTokenExchange) callbackAfterTokenExchange(false);
            }
        }

        function generateState() {
            var state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            Lampa.Storage.set("vk_oauth_state", state);
            return state;
        }

        function handleAuthCallback(urlWithCodeAndState, callbackAfterTokenExchange) {
            log("Handling auth callback: " + urlWithCodeAndState);
            const params = new URLSearchParams(urlWithCodeAndState.substring(urlWithCodeAndState.indexOf("?")));
            const code = params.get("code");
            const state = params.get("state");
            const storedState = Lampa.Storage.get("vk_oauth_state", null);
            if (!state || !storedState || storedState !== state) {
                Lampa.Noty.show("Ошибка авторизации: несовпадение состояния.");
                Lampa.Storage.remove("vk_oauth_state");
                if(callbackAfterTokenExchange) callbackAfterTokenExchange(false); return;
            }
            Lampa.Storage.remove("vk_oauth_state");
            if (code) {
                exchangeCodeForToken(code, callbackAfterTokenExchange);
            } else {
                Lampa.Noty.show("Ошибка авторизации: код не получен.");
                if(callbackAfterTokenExchange) callbackAfterTokenExchange(false);
            }
        }

        function exchangeCodeForToken(code, callback) {
            log("Exchanging code for token...");
            const requestParams = { client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code: code };
            var queryParams = Object.keys(requestParams).map(key => key + "=" + encodeURIComponent(requestParams[key])).join("&");
            network.silent(TOKEN_URL + "?" + queryParams, function (response) {
                if (response.access_token) {
                    saveAuthData(response);
                    if(callback) callback(true);
                } else {
                    Lampa.Noty.show("Ошибка обмена токена: " + (response.error_description || response.error || "Неизвестная ошибка"));
                    if(callback) callback(false);
                }
            }, function (xhr, status, error) {
                Lampa.Noty.show("Ошибка сети при обмене токена.");
                if(callback) callback(false);
            }, false, { method: "POST", dataType: "json" });
        }

        function refreshToken(callback) {
            log("Refreshing token...");
            settings = Lampa.Storage.get("vk_auth_data", {});
            if (!settings.refresh_token) {
                if (callback) callback(false); return;
            }
            const requestParams = { grant_type: "refresh_token", refresh_token: settings.refresh_token, client_id: CLIENT_ID };
            var queryParams = Object.keys(requestParams).map(key => key + "=" + encodeURIComponent(requestParams[key])).join("&");
            network.silent(TOKEN_URL + "?" + queryParams, function (response) {
                if (response.access_token) {
                    saveAuthData(response);
                    if (callback) callback(true);
                } else {
                    Lampa.Noty.show("Ошибка обновления токена: " + (response.error_description || response.error || "Потребуется повторная авторизация"));
                    clearAuthData();
                    if (callback) callback(false);
                }
            }, function (xhr, status, error) {
                Lampa.Noty.show("Ошибка сети при обновлении токена.");
                if (callback) callback(false);
            }, false, { method: "POST", dataType: "json" });
        }

        function saveAuthData(authData) {
            var newSettings = Lampa.Storage.get("vk_auth_data", {});
            newSettings.access_token = authData.access_token;
            newSettings.user_id = authData.user_id;
            if (authData.expires_in) {
                newSettings.expires_at = Date.now() + (parseInt(authData.expires_in) * 1000) - (5 * 60 * 1000);
            }
            if (authData.refresh_token) {
                newSettings.refresh_token = authData.refresh_token;
            }
            Lampa.Storage.set("vk_auth_data", newSettings);
            settings = newSettings;
        }

        function clearAuthData() {
            Lampa.Storage.set("vk_auth_data", {});
            settings = {};
            Lampa.Noty.show("Вы вышли из аккаунта VK.");
        }

        // -- VK API Interaction Section (same as v0.0.3) -- //
        function vkApiRequest(method, params, callback, errorCallback) {
            settings = Lampa.Storage.get("vk_auth_data", {});
            if (!settings.access_token) {
                if (errorCallback) errorCallback({error_msg: "No access token"}); return;
            }
            params.access_token = settings.access_token;
            params.v = VK_API_VERSION;
            var url = "https://api.vk.com/method/" + method;
            network.silent(url, function(response) {
                if (response.error) {
                    if (errorCallback) errorCallback(response.error);
                    if (response.error.error_code === 5) {
                        refreshToken(function(success) {
                            if (!success) clearAuthData();
                        });
                    }
                } else {
                    if (callback) callback(response.response);
                }
            }, function(xhr, status, error) {
                if (errorCallback) errorCallback({error_msg: "Network error: " + status});
            }, params, { dataType: "jsonp" });
        }

        function performSearchVK(title, year, type) {
            var query = title;
            if (year) query += " " + year;
            vkApiRequest("video.search", { q: query, count: 20, adult: 0, filters: "mp4" }, function(data) {
                searchResults = data.items || [];
                processSearchResults(searchResults);
                component.loading(false);
                if (searchResults.length === 0) component.empty();
            }, function(error) {
                Lampa.Noty.show("Ошибка поиска в VK: " + error.error_msg);
                component.loading(false); component.empty();
            });
        }

        // -- Stream Extraction & Parsing Section (same as v0.0.3) -- //
        function extractStreamFromPlayer(playerUrl, videoId, callback) {
            if (extractedStreams[videoId] && (Date.now() - extractedStreams[videoId].timestamp < STREAM_CACHE_DURATION)) {
                log("Returning cached streams for " + videoId);
                callback(extractedStreams[videoId].streams);
                return;
            }
            network.native(playerUrl, function(htmlResponse) {
                var streams = {};
                try {
                    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
                    let scriptMatch;
                    while ((scriptMatch = scriptRegex.exec(htmlResponse)) !== null) {
                        const scriptContent = scriptMatch[1];
                        const jsonRegex = /playerParams\s*=\s*({[\s\S]*?});/i;
                        const paramsMatch = scriptContent.match(jsonRegex);
                        if (paramsMatch && paramsMatch[1]) {
                            try {
                                const playerData = JSON.parse(paramsMatch[1]);
                                if (playerData.urls) {
                                    for (const q in playerData.urls) {
                                        if (playerData.urls[q] && typeof playerData.urls[q] === "string") {
                                            streams[q] = playerData.urls[q].replace(/\\\//g, "/");
                                        }
                                    }
                                }
                                if (playerData.sources) {
                                     if (Array.isArray(playerData.sources)) {
                                        playerData.sources.forEach(function(source) {
                                            if (source.src && source.type && source.type.includes("mp4")) {
                                                streams[source.label || "auto"] = source.src.replace(/\\\//g, "/");
                                            }
                                        });
                                    } else { 
                                        for (const q in playerData.sources) {
                                            if (typeof playerData.sources[q] === "string" && playerData.sources[q].includes(".mp4")) {
                                                 streams[q] = playerData.sources[q].replace(/\\\//g, "/");
                                            }
                                        }
                                    }
                                }
                                if (playerData.hls) streams["hls"] = playerData.hls.replace(/\\\//g, "/");
                                if (playerData.dash) streams["dash"] = playerData.dash.replace(/\\\//g, "/");
                                if (Object.keys(streams).length > 0) break;
                            } catch (e) { log("Error parsing JSON from script: " + e.message); }
                        }
                    }
                    if (Object.keys(streams).length === 0) {
                        const mp4Regex = /"(?:url|src|mp4)[_]?(\d{3,4})?"\s*:\s*"(https?:\/\/[^"\s]+\.mp4(?:\?[^"\s]*)?)"/gi;
                        let mp4Match;
                        while ((mp4Match = mp4Regex.exec(htmlResponse)) !== null) {
                            const qualityLabel = mp4Match[1] ? mp4Match[1] + "p" : "auto";
                            streams[qualityLabel] = mp4Match[2].replace(/\\\//g, "/");
                        }
                        if (Object.keys(streams).length === 0) {
                             const genericMp4Regex = /"(https?:\/\/[^"\s]+\.mp4(?:\?[^"\s]*)?)"/gi;
                             while ((mp4Match = genericMp4Regex.exec(htmlResponse)) !== null) {
                                if (!streams["auto"]) streams["auto"] = mp4Match[1].replace(/\\\//g, "/");
                                else streams["auto_" + Object.keys(streams).length] = mp4Match[1].replace(/\\\//g, "/");
                             }
                        }
                    }
                    if (!streams.hls) {
                        const m3u8Regex = /"(https?:\/\/[^"\s]+\.m3u8(?:\?[^"\s]*)?)"/gi;
                        let m3u8Match = m3u8Regex.exec(htmlResponse);
                        if (m3u8Match && m3u8Match[1]) {
                            streams["hls"] = m3u8Match[1].replace(/\\\//g, "/");
                        }
                    }
                } catch (e) { log("Error during stream parsing: " + e.message); }
                if (Object.keys(streams).length > 0) {
                    extractedStreams[videoId] = { streams: streams, timestamp: Date.now() };
                    callback(streams);
                } else {
                    Lampa.Noty.show("Не удалось извлечь ссылку на видеопоток.");
                    callback(null);
                }
            }, function() {
                Lampa.Noty.show("Ошибка загрузки страницы плеера VK.");
                callback(null);
            }, false, {dataType: "text"});
        }

        // -- UI Integration & Filtering Section (IMPROVED from v0.0.4) -- //
        function processSearchResults(vkItems) {
            log("Processing search results for Lampa display...");
            var lampaItems = [];
            if (!vkItems || vkItems.length === 0) {
                searchResults = [];
                applyFiltersAndDisplay();
                return;
            }
            vkItems.forEach(function(vkItem) {
                var lampaItem = {
                    id: vkItem.owner_id + "_" + vkItem.id,
                    title: vkItem.title,
                    description: vkItem.description,
                    poster: vkItem.image ? vkItem.image[vkItem.image.length - 1].url : "",
                    player_url: vkItem.player,
                    duration: vkItem.duration,
                    vk_item: vkItem
                };
                lampaItems.push(lampaItem);
            });
            searchResults = lampaItems;
            buildFilters(); 
            applyFiltersAndDisplay();
        }

        function buildFilters() {
            log("Building filters...");
            filterItems.quality = [
                { title: "Авто", value: "auto", index: "auto" },
                { title: "1080p", value: "1080p", index: "1080p" },
                { title: "720p", value: "720p", index: "720p" },
                { title: "480p", value: "480p", index: "480p" },
                { title: "360p", value: "360p", index: "360p" }
            ];
            if (typeof component.filter === "function") {
                component.filter(filterItems, choice); 
            } else {
                log("Warning: component.filter is not a function. Filters might not be displayed.");
            }
        }

        function applyFiltersAndDisplay() {
            log("Applying filters and displaying items... Current quality choice: " + choice.quality);
            component.reset();
            if (searchResults.length === 0) {
                log("No search results to display.");
                component.empty();
                return;
            }

            searchResults.forEach(function(element) {
                var displayQuality = choice.quality === "auto" ? "Авто" : choice.quality;

                var item = Lampa.Template.get("online", {
                    title: element.title,
                    info: "VK Video / " + (element.duration ? Lampa.Utils.secondsToTime(element.duration) : ""),
                    quality: displayQuality
                });
                item.addClass("video--stream");

                item.on("hover:enter", function() {
                    log("Play requested for: " + element.title + " (ID: " + element.id + ") with chosen quality: " + choice.quality);
                    if (currentObject.movie && currentObject.movie.id) {
                        Lampa.Favorite.add("history", currentObject.movie, 100);
                    }
                    extractStreamFromPlayer(element.player_url, element.id, function(availableStreams) {
                        if (availableStreams && Object.keys(availableStreams).length > 0) {
                            var streamUrlToPlay = availableStreams[choice.quality];
                            var usedQuality = choice.quality;

                            if (!streamUrlToPlay && choice.quality !== "auto" && availableStreams["auto"]) {
                                streamUrlToPlay = availableStreams["auto"];
                                usedQuality = "auto (fallback from " + choice.quality + ")";
                                log("Chosen quality '"+choice.quality+"' not found, falling back to 'auto': " + streamUrlToPlay);
                            } else if (!streamUrlToPlay) { // If chosen (even auto) or auto fallback not found, try first available
                                var firstKey = Object.keys(availableStreams)[0];
                                streamUrlToPlay = availableStreams[firstKey];
                                usedQuality = firstKey + " (fallback - first available)";
                                log("Chosen quality '"+choice.quality+"' and 'auto' not found, falling back to first available ('"+firstKey+"'): " + streamUrlToPlay);
                            }

                            if (streamUrlToPlay) {
                                log("Playing stream: " + streamUrlToPlay + " (Effective quality: "+usedQuality+")");
                                var playData = {
                                    title: element.title,
                                    url: streamUrlToPlay,
                                    quality: availableStreams 
                                };
                                Lampa.Player.play(playData);
                            } else {
                                Lampa.Noty.show("Не удалось найти подходящий видеопоток для выбранного качества.");
                                log("Error: No streamUrlToPlay could be determined even after fallbacks.");
                            }
                        } else {
                            Lampa.Noty.show("Не удалось получить ссылку для воспроизведения.");
                        }
                    });
                });
                component.append(item);
            });
            component.start(true);
        }

        buildFilters();

    }

    if (window.Lampa) {
        Lampa.Source.add("vk_video", LampaVKVideoSource);
        console.log("LampaVKVideoSource registered with Lampa (v0.0.5).");
    } else {
        console.error("LampaVKVideoSource: Lampa global object not found.");
    }

})();

