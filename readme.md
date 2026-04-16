docker run --rm -v ${PWD}/kanidm_data:/export alpine/openssl req -x509 -newkey rsa:4096 -keyout /export/key.pem -out /export/cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"

kanidm password EKB9QxDujSRMYDwszMHgRbeSkXTyGkXC8AUwTvxDHHSfrBy6

idm_admin utWcrxZEJBDDKBX5c8chTXQuNqrrdMM52yK9vPM3gCh1sSMk