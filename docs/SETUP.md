# Pornirea aplicației pe calculatorul tău

Ghid pas cu pas pentru a rula OCRInvoice local: serverul, aplicația pe telefon și (opțional) citirea automată a bonurilor (OCR).

Vei avea **trei ferestre de terminal** deschise în același timp:

| Fereastra | Ce rulează | Obligatorie? |
|---|---|---|
| 1. Server | API-ul (`server/`), pe portul 3000 | Da |
| 2. Expo | Aplicația pentru telefon (`mobile/`) | Da |
| 3. OCR | llama.cpp cu modelul Qwen3-VL, pe portul 8080 | Doar pentru scanarea bonurilor |

Fără fereastra 3 merge tot în afară de scanare: la „Continuă” după poză vei vedea „Documentul nu a putut fi citit. Serviciul de citire nu răspunde.”

---

## 1. Ce îți trebuie

**Pe calculator**

- **Git** — https://git-scm.com/downloads
- **Node.js 22 (LTS)** — https://nodejs.org (proiectul e testat cu Node 22.21 și npm 10). Verifică în terminal:
  ```bash
  node -v
  npm -v
  ```
- Acces la repository-ul `StefanAna-Maria/MOPS` pe GitHub.
- **Datele de conectare la baza de date (Neon)** — le primești de la cine administrează proiectul Neon al echipei (vezi pasul 3).

**Pe telefon**

- Aplicația **Expo Go** din Google Play / App Store (trebuie să fie versiunea pentru Expo SDK 58, adică ultima din magazin).
- Telefonul și calculatorul în **aceeași rețea Wi-Fi**. Adresa rețelei trebuie să înceapă cu `192.168.` (vezi „Probleme frecvente”).

**Doar pentru scanare (OCR)**

- Aproximativ **4 GB liberi** pe disc (programul + modelul).
- Minimum **8 GB RAM** (recomandat 16 GB). Cu placă video merge mult mai repede; doar pe procesor merge, dar încet.

---

## 2. Descarcă proiectul și instalează pachetele

```bash
git clone https://github.com/StefanAna-Maria/MOPS.git
cd MOPS
git checkout main
```

Dacă lucrezi pe ramura ta, schimbă `main` cu numele ramurii (de exemplu `git checkout cristina`).

Instalează tot (o singură comandă, din rădăcina proiectului):

```bash
npm install
```

Aceasta instalează pachetele pentru `shared`, `server` și `mobile`, construiește pachetul `shared` și generează clientul Prisma. Durează câteva minute prima dată.

---

## 3. Configurează serverul

### 3.1 Fișierul `server/.env`

Copiază exemplul:

```bash
cd server
cp .env.example .env
```

(Pe Windows în PowerShell: `Copy-Item .env.example .env`.)

Deschide `server/.env` și completează:

| Variabilă | Ce pui |
|---|---|
| `DATABASE_URL` | Adresa bazei de date Neon **cu** `-pooler` în nume (o primești de la echipă) |
| `DATABASE_URL_UNPOOLED` | Aceeași adresă **fără** `-pooler` (folosită pentru migrări) |
| `NEON_BRANCH` | `dev` |
| `BETTER_AUTH_SECRET` | Un text secret lung, generat de tine (comanda de mai jos) |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `NODE_ENV` | **`development`** — obligatoriu, altfel serverul refuză logarea din Expo Go |
| `RESEND_API_KEY` | Lasă gol: codurile de confirmare apar atunci în fereastra serverului |
| `EMAIL_FROM` | Lasă cum e |
| `OCR_URL` | `http://127.0.0.1:8080` (unde rulează llama.cpp) |
| `OCR_TIMEOUT_MS` | `300000` (5 minute) |
| `UPLOAD_DIR` | `uploads` (pozele scanate se salvează în `server/uploads/`, care nu intră în git) |

Generează `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copiază rezultatul în `.env`. **Nu pune niciodată `.env` în git** (e deja în `.gitignore`).

### 3.2 Fișierul `server/.env.test` (doar dacă rulezi testele)

Testele automate ale serverului folosesc **o bază de date separată**, pentru că **șterg toți utilizatorii** la fiecare test.

```bash
cp .env.example .env.test
```

Completează-l la fel ca `.env`, dar cu adresele **ramurii tale Neon de test** și **`NODE_ENV="test"`** (obligatoriu: în teste emailurile nu se trimit, ci sunt doar păstrate pentru verificare).

> ⚠️ **Fiecare coleg are nevoie de propria ramură de test.** În consola Neon: proiectul echipei → **Branches** → **Create branch**, cu un nume ca `test-ana`, `test-luisa` (pornită din `main` sau `dev`). Copiază adresele ei (cu și fără `-pooler`) în `.env.test` și pune `NEON_BRANCH="test-<numele-tău>"`.
>
> Testele șterg **toți** utilizatorii la fiecare pas. Dacă doi colegi rulează testele în același timp pe aceeași ramură, își șterg datele unul altuia și apar zeci de erori fără legătură cu codul (`ForeignKeyConstraintViolation`, `expected 401 to be 400`, „Invalid email or password”). S-a întâmplat pe 21.11.2026.
>
> Nu pune nici în `.env.test` aceeași bază de date ca în `.env`: rularea testelor ți-ar șterge conturile și cheltuielile de dezvoltare.

### 3.3 Creează tabelele în baza de date

Tot din folderul `server`:

```bash
npx prisma migrate deploy
```

Aplică toate migrările existente (tabele pentru conturi, firme, documente, poze scanate). Dacă scrie „No pending migrations to apply”, baza e deja la zi.

Pentru baza de test (doar dacă rulezi testele), aplică migrările și pe ea, încărcând `.env.test` (PowerShell):

```powershell
Get-Content .env.test | ForEach-Object { if ($_ -match '^([A-Z_]+)="?(.*?)"?$') { Set-Item "env:$($matches[1])" $matches[2] } }; npx prisma migrate deploy
```

> Folosește `migrate deploy`, nu `npm run db:migrate` (`migrate dev`): `deploy` doar aplică migrările existente, pe când `migrate dev` e pentru cine **creează** o migrare nouă și poate propune ștergerea datelor.

---

## 4. Pornește serverul (fereastra 1)

```bash
cd server
npm run dev
```

Trebuie să apară `Server is running on http://localhost:3000`. Verifică în browser: http://localhost:3000/api/health trebuie să arate `{"status":"ok"}`.

Lasă fereastra deschisă: aici vezi fiecare cerere (`<-- GET /api/me`, `--> ... 200`) și codurile de confirmare a emailului.

**Windows:** prima dată poate apărea „Paravanul de protecție Windows a blocat unele caracteristici”. Bifează **Rețele private** și apasă **Permiteți accesul** — altfel telefonul nu ajunge la server.

---

## 5. Pornește aplicația (fereastra 2)

Într-un terminal nou:

```bash
cd mobile
npx expo start
```

Apare un cod QR.

- **Android:** deschide Expo Go și scanează codul QR.
- **iPhone:** scanează codul QR cu aplicația Cameră; se deschide în Expo Go.

Dacă scanarea nu merge, în Expo Go scrie adresa afișată sub codul QR (`exp://192.168.x.x:8081`).

Aplicația găsește singură serverul pe calculatorul tău (aceeași adresă ca Expo, portul 3000). Nu trebuie să completezi `mobile/.env`.

---

## 6. Creează-ți un cont

1. În aplicație: **Creează cont**, cu emailul tău și o parolă (minimum 8 caractere, o cifră, o literă mare).
2. Codul de confirmare de 6 cifre **nu vine pe email** (fără `RESEND_API_KEY`): îl găsești în fereastra serverului, pe o linie de forma
   ```
   [email-otp] email-verification tu@exemplu.ro: 123456
   ```
3. Scrie codul în aplicație. Gata — ajungi pe Acasă.

---

## 7. Citirea automată a bonurilor — OCR (fereastra 3, opțional)

Scanarea folosește modelul **Qwen3-VL 4B** rulat local cu **llama.cpp**. Le descarci o singură dată.

### 7.1 Descarcă llama.cpp

**Windows**

1. Deschide https://github.com/ggml-org/llama.cpp/releases și alege o versiune recentă (numele începe cu `b`, de exemplu `b12377`).
2. La „Assets”, descarcă arhiva potrivită plăcii tale video:
   - **Placă NVIDIA:** `llama-bXXXXX-bin-win-cuda-12.4-x64.zip` **și** `cudart-llama-bin-win-cuda-12.4-x64.zip` (dezarhivează-le în același folder).
   - **Placă Intel sau AMD (inclusiv grafica integrată):** `llama-bXXXXX-bin-win-vulkan-x64.zip`.
   - **Fără placă video dedicată / nu știi:** `llama-bXXXXX-bin-win-vulkan-x64.zip` (folosește grafica integrată) sau `llama-bXXXXX-bin-win-cpu-x64.zip` (doar procesor, cel mai lent).
3. Dezarhivează în `C:\llama\bin`, ca să existe `C:\llama\bin\llama-server.exe`.

**macOS**

```bash
brew install llama.cpp
```

(Pe Mac cu procesor Apple M, placa video e folosită automat.)

### 7.2 Descarcă modelul (aproximativ 3,2 GB, două fișiere)

Creează folderul `C:\llama\models` (pe Mac, de exemplu `~/llama/models`) și descarcă în el **ambele** fișiere, de pe pagina oficială Qwen (https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF):

| Fișier | Mărime | Link direct |
|---|---|---|
| `Qwen3VL-4B-Instruct-Q4_K_M.gguf` (modelul) | 2,4 GB | https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf |
| `mmproj-Qwen3VL-4B-Instruct-F16.gguf` (partea care „vede” imaginea) | 0,8 GB | https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-F16.gguf |

Ai nevoie de amândouă: fără al doilea, modelul nu poate citi imagini.

### 7.3 Pornește OCR-ul

**Windows (PowerShell)** — o singură linie:

```powershell
& 'C:\llama\bin\llama-server.exe' -m 'C:\llama\models\Qwen3VL-4B-Instruct-Q4_K_M.gguf' --mmproj 'C:\llama\models\mmproj-Qwen3VL-4B-Instruct-F16.gguf' -ngl 99 -c 16384 -np 1 --host 127.0.0.1 --port 8080
```

**macOS:**

```bash
llama-server -m ~/llama/models/Qwen3VL-4B-Instruct-Q4_K_M.gguf --mmproj ~/llama/models/mmproj-Qwen3VL-4B-Instruct-F16.gguf -ngl 99 -c 16384 -np 1 --host 127.0.0.1 --port 8080
```

Ce înseamnă opțiunile (păstrează-le exact așa):

- `-ngl 99` — folosește placa video pentru tot modelul (dacă există);
- `-c 16384` — memoria de lucru; o poză de pe telefon are nevoie de ~4.500, cu 8192 citirile mai mari eșuează;
- `-np 1` — o singură citire odată (serverul nostru le pune oricum la coadă);
- `--host 127.0.0.1` — accesibil doar de pe calculatorul tău.

Așteaptă linia `listening on http://127.0.0.1:8080`. Verifică: http://127.0.0.1:8080/health trebuie să arate `{"status":"ok"}`.

### 7.4 Scanează un bon

Pe Acasă, deschide camera, fotografiază un bon, apasă **Continuă**. Citirea durează **între 30 de secunde și 2 minute**, în funcție de lungimea bonului și de calculator. La final vezi magazinul, data, totalul, produsele și cât de sigură e fiecare valoare.

---

## 8. Rularea testelor

Din rădăcina proiectului (are nevoie de `server/.env.test`, pasul 3.2):

```bash
npm test
```

Testele **nu** au nevoie de llama.cpp: răspunsurile OCR sunt simulate. Pentru acoperire: `npm run test:coverage`.

---

## 9. După fiecare `git pull`

```bash
git pull
npm install
cd server
npx prisma migrate deploy
```

Apoi repornește serverul (Ctrl+C și `npm run dev`) și Expo (Ctrl+C și `npx expo start`). Dacă aplicația arată ciudat după actualizare, pornește Expo cu cache-ul curățat: `npx expo start --clear`.

---

## 10. Probleme frecvente

| Ce vezi | Cauza | Ce faci |
|---|---|---|
| „Serverul nu răspunde” în aplicație | Telefonul nu ajunge la calculator | Același Wi-Fi? Serverul pornit (fereastra 1)? Pe Windows: permite Node.js în paravanul de protecție pentru rețele private. |
| Logarea eșuează din aplicație, deși parola e bună | Adresa rețelei nu începe cu `192.168.` sau `NODE_ENV` nu e `development` | Verifică `NODE_ENV="development"` în `server/.env`. Serverul acceptă în dezvoltare doar adrese `192.168.*`: folosește o rețea Wi-Fi de acest tip (sau hotspotul telefonului). |
| Nu primesc codul de confirmare pe email | Fără `RESEND_API_KEY` emailurile nu se trimit | Caută `[email-otp]` în fereastra serverului. |
| `Documentul nu a putut fi citit. Serviciul de citire nu răspunde.` | llama.cpp nu rulează sau a rămas fără memorie | Pornește fereastra 3 (pasul 7.3), cu `-c 16384 -np 1`. Verifică http://127.0.0.1:8080/health. |
| `Citirea a durat prea mult` | Calculator lent (fără placă video) sau bon foarte lung | Mărește `OCR_TIMEOUT_MS` în `server/.env` (de exemplu `600000` = 10 minute) și repornește serverul. |
| Etapele de citire rămân la „Citim documentul” până la final | Serverul nu primește răspunsul llama.cpp pe bucăți (streaming) | Actualizează la ultima versiune din `main` (repararea din 21.11.2026) și repornește serverul. |
| `Nu am putut trimite poza` | Poza nu a ajuns la server | Uită-te în fereastra Expo după linia `Scan upload failed:` — spune motivul exact. |
| `Port 8081 is being used by another process` la Expo | A rămas pornit un Expo mai vechi | Închide celălalt terminal cu Expo sau răspunde `Y` ca să folosească alt port. |
| Zeci de teste de server pică „aleator” (`ForeignKeyConstraintViolation`, `expected 401 to be 400`, „Invalid email or password”), de fiecare dată altele | Altcineva rulează testele în același timp pe aceeași ramură Neon de test | Folosește-ți propria ramură de test (pasul 3.2). |
| Erori Prisma de tipul „table does not exist” | Lipsesc migrări | Din `server`: `npx prisma migrate deploy`. |
| Erori TypeScript cu rute ca `/scan-result/[id]` | Lista de rute Expo nu e regenerată | Pornește o dată `npx expo start` (o regenerează), apoi încearcă din nou. |
