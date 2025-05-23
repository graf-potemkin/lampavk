# Lampa VK Video Source Plugin

## Обзор

Этот плагин (источник) для медиатеки Lampa позволяет интегрировать просмотр видеоконтента из сервиса VK Video. Пользователи могут авторизоваться через свой VK ID, осуществлять поиск видео и просматривать его непосредственно в интерфейсе Lampa.

Версия плагина: 0.0.5 (от 16 мая 2025 г.)

## Возможности

*   **Авторизация через VK ID**: Безопасный вход с использованием OAuth 2.0 для доступа к видео VK.
*   **Поиск видео**: Поиск видеозаписей в VK Video по названию и году.
*   **Извлечение прямых ссылок**: Автоматическое получение прямых ссылок на видеопотоки (MP4, M3U8/HLS) со страниц плеера VK.
*   **Кэширование ссылок**: Временное кэширование извлеченных ссылок на потоки для ускорения повторного доступа.
*   **Выбор качества**: Интеграция со стандартными фильтрами качества Lampa. Плагин предоставляет список стандартных качеств, а Lampa Player должен обрабатывать их доступность.
*   **Сохранение выбора качества**: Выбранное пользователем качество сохраняется и используется по умолчанию при последующих просмотрах.
*   **Обработка ошибок**: Информирование пользователя о статусе операций и возникающих ошибках (например, проблемы с авторизацией, недоступность видео).
*   **Обновление токенов**: Поддержка автоматического и ручного (через настройки плагина) обновления токенов доступа VK.

## Установка

1.  Скопируйте файл `lampa_vk_video_source.js` в директорию плагинов вашей установки Lampa (обычно это папка `plugins` или аналогичная, в зависимости от вашей конфигурации Lampa).
2.  Перезапустите Lampa или обновите список источников, если это предусмотрено вашей версией Lampa.

## Настройка

**Критически важно!** Перед использованием плагина необходимо настроить его, указав ваши собственные `CLIENT_ID` и `REDIRECT_URI` от приложения VK.

1.  **Создайте приложение VK**: Если у вас его еще нет, зарегистрируйте приложение на платформе [VK Developers](https://dev.vk.com/apps) (например, тип "Standalone-приложение").
2.  **Получите `CLIENT_ID`**: Это идентификатор вашего приложения VK (ID приложения).
3.  **Укажите `REDIRECT_URI`**: В настройках вашего приложения VK (в разделе "Настройки" -> "Авторизация") укажите URI, на который будет происходить перенаправление после авторизации. Этот же URI должен быть указан в плагине. 
    *   Пример: `https://lampa.example.com/vk_oauth_callback` (замените `lampa.example.com` на актуальный домен, где доступна Lampa, или используйте специфичный для Lampa URI, если он обрабатывается самой Lampa для OAuth колбэков). 
    *   Убедитесь, что этот URI точно совпадает в настройках VK приложения и в коде плагина.
4.  **Отредактируйте плагин**: Откройте файл `lampa_vk_video_source.js` и найдите следующие строки:

    ```javascript
    const CLIENT_ID = "YOUR_VK_APP_ID"; // CRITICAL: MUST BE REPLACED BY THE DEVELOPER
    const REDIRECT_URI = "YOUR_LAMPA_REDIRECT_URI"; // CRITICAL: MUST BE REPLACED BY THE DEVELOPER
    ```

    Замените `"YOUR_VK_APP_ID"` на ваш `CLIENT_ID` (ID приложения) и `"YOUR_LAMPA_REDIRECT_URI"` на ваш `REDIRECT_URI`.

## Использование

1.  После установки и настройки плагина, он появится в списке доступных источников в Lampa.
2.  При первой попытке поиска через источник VK Video вам будет предложено авторизоваться. Перейдите в настройки источника (если это не произошло автоматически) и нажмите "Войти через VK".
3.  Следуйте инструкциям во всплывающем окне (prompt):
    *   Скопируйте предложенный URL (он также будет выведен в консоль разработчика вашего браузера).
    *   Откройте этот URL в новой вкладке браузера.
    *   Разрешите доступ вашему приложению VK.
    *   После успешного разрешения доступа, вас перенаправит на указанный вами `REDIRECT_URI`. В адресной строке браузера на этой странице будет параметр `code` (например, `https://your-redirect-uri/?code=ABCDEF12345...`).
    *   Скопируйте значение этого параметра `code`.
4.  Вставьте скопированный `code` в диалоговое окно Lampa, которое его запрашивает.
5.  После успешной авторизации вы сможете выполнять поиск и просмотр видео из VK.
6.  В настройках плагина также доступна опция выхода из аккаунта VK и обновления токена.

## Примечания по безопасности и PKCE

*   **`client_secret`**: Данный плагин предназначен для работы как публичный клиент (client-side) и **не должен** содержать `client_secret` вашего приложения VK. Все операции, требующие `client_secret` (если таковые предусмотрены для вашего типа приложения VK), должны выполняться на стороне сервера.
*   **PKCE (Proof Key for Code Exchange)**: Текущая реализация плагина содержит заглушки для PKCE. Для повышения безопасности авторизации в публичных клиентах настоятельно рекомендуется реализовать полноценную поддержку PKCE. Это потребует использования криптографических функций для генерации `code_verifier` и `code_challenge` (SHA256, Base64URL-кодирование), которые могут быть недоступны в стандартной среде Lampa без дополнительных библиотек или возможностей платформы Lampa.

## Возможные проблемы и их решения

*   **Ошибка "CLIENT_ID или REDIRECT_URI не настроены"**: Убедитесь, что вы правильно отредактировали файл плагина и указали свои `CLIENT_ID` и `REDIRECT_URI`.
*   **Проблемы с авторизацией (ошибка state mismatch, неверный redirect_uri и т.д.)**: 
    *   Проверьте точность совпадения `REDIRECT_URI` в настройках вашего VK-приложения и в коде плагина (включая `http` vs `https`).
    *   Убедитесь, что ваше приложение VK активно и имеет необходимые разрешения (например, доступ к видео).
    *   Очистите кэш Lampa или браузера, если проблемы сохраняются после проверки настроек.
*   **Видео не загружается / ошибка извлечения потока**: VK может изменять структуру своих страниц плеера. Если парсер перестал работать, потребуется обновить регулярные выражения или логику извлечения ссылок в функции `extractStreamFromPlayer` в файле плагина.
*   **Истек срок действия токена**: Плагин пытается автоматически обновлять токен. Если это не удается, воспользуйтесь опцией "Обновить токен VK" в настройках плагина или пройдите авторизацию заново.

## Для разработчиков

### Структура кода

Плагин написан на JavaScript и следует стандартной структуре источников Lampa. Основные секции кода:

*   Инициализация (константы, переменные состояния, настройки по умолчанию).
*   Основные методы интерфейса Lampa (`search`, `reset`, `filter`, `destroy`, `settings`).
*   Секция аутентификации (логика OAuth 2.0, обработка колбэка, PKCE-заглушки, получение/обновление/сохранение токенов).
*   Секция взаимодействия с VK API (универсальная функция `vkApiRequest`, функция поиска `performSearchVK`).
*   Секция извлечения и парсинга потоков (функция `extractStreamFromPlayer` с логикой парсинга HTML и JSON, кэшированием).
*   Секция интеграции с UI Lampa (`processSearchResults`, `buildFilters`, `applyFiltersAndDisplay`).

### Логирование

Плагин использует `console.log` для вывода отладочной информации в консоль разработчика браузера. Сообщения имеют префикс `LampaVKVideoSource:`, что помогает фильтровать логи.

## Вклад (Contributing)

Предложения по улучшению и сообщения об ошибках приветствуются! Пожалуйста, создавайте Issue в этом репозитории для обсуждения или отправляйте Pull Request с вашими изменениями.

Для серьезных изменений, пожалуйста, сначала откройте Issue для обсуждения того, что вы хотели бы изменить.

## Лицензия

Данный плагин предоставляется "как есть", без каких-либо гарантий. Вы можете использовать и модифицировать его на свой страх и риск. 

Пожалуйста, всегда соблюдайте условия использования API VK ([VK API Terms of Service](https://vk.com/dev/rules)).

## Благодарности

*   Разработчикам Lampa за создание и поддержку открытой платформы.
*   Сообществу VK API за предоставленные возможности для интеграции.

