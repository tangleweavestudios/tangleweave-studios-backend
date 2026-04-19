Вариант 1: Правильный (Установка mkcert)
Инструмент mkcert создает на вашем компьютере локальный Центр Сертификации (CA) и заставляет Windows/macOS и все браузеры доверять ему. В результате вы получаете зеленый замочек в браузере и никаких ошибок CORS/SSL.

Шаг 1: Установите mkcert

Windows (нужен пакетный менеджер Chocolatey или Scoop): choco install mkcert

macOS: brew install mkcert

Linux: sudo apt install libnss3-tools && brew install mkcert (через Homebrew)

Шаг 2: Создайте локальный доверенный центр
Откройте терминал и выполните:

Bash
mkcert -install
Система может попросить права администратора, чтобы добавить корневой сертификат в доверенные.

Шаг 3: Выпустите сертификат для вашего домена
Зайдите в папку вашего проекта (туда, где лежит docker-compose.yml) и выполните:

Bash
mkcert "*.tangleweave.local" tangleweave.local localhost 127.0.0.1 ::1
Эта команда создаст два файла: _wildcard.tangleweave.local+4.pem и _wildcard.tangleweave.local+4-key.pem.

Шаг 4: Положите их в Nginx
Переименуйте эти файлы в cert.pem и key.pem соответственно, и замените ими старые сертификаты в вашей папке ./nginx/certs/.

Перезапустите Nginx:

Bash
docker compose --profile dev restart nginx
Важно: После этого полностью закройте браузер и откройте заново, чтобы он подхватил новые правила безопасности.