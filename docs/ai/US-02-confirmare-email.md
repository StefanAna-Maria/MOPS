# US-02 (partea 1) - Confirmarea emailului cu cod: realizare cu AI

## Ce s-a cerut

Din US-02 s-a implementat doar confirmarea emailului cu un cod de 6 cifre (CA-02.1 - CA-02.7), cu implementare și testare. Sesiunea păstrată (CA-02.8 - CA-02.10) și resetarea parolei (CA-02.11 - CA-02.14) rămân pentru etapele următoare.

## Cum a fost folosit AI-ul

Asistentul AI (Claude Code) a lucrat direct în repository:

1. **Citirea codului existent.** A parcurs configurarea de autentificare de pe server (`better-auth` cu pluginul `emailOTP` deja pornit, dar doar cu log), ecranul placeholder `verify-email.tsx`, testele existente și documentul `CA-01.md`, ca să respecte stilul proiectului.
2. **Verificarea comportamentului bibliotecii.** A citit codul sursă al pluginului `emailOTP` din `node_modules` pentru a afla codurile de eroare reale (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`), cum se face autologin-ul și cum se stochează codul, în loc să le presupună.
3. **Implementare.**
   - Server: cod de 6 cifre, expirare 5 minute, stocare ca hash, autologin după verificare, limite de rată pe cerere de cod nou și pe verificare, trimitere email prin Resend (opțional) sau log în dezvoltare.
   - Mobile: ecran cu 6 căsuțe, „Confirmă” activ doar cu 6 cifre, mesaje de eroare, numărătoare de 30 de secunde și „Trimite un cod nou”.
4. **Teste.** 12 teste noi pe server (`server/tests/verify-email.test.ts`) și 13 în aplicație (`mobile/tests/verify-email.test.tsx`), plus documentul de test cases `docs/test-cases/CA-02.md`.
5. **Verificare.** S-au rulat testele și `tsc` pe ambele proiecte: 58 de teste pe server și 70 în mobile au trecut; AI-ul a corectat o eroare de tipuri apărută în `code-input.tsx`.

## Ce a verificat omul

- Manual, pe telefon (Expo Go): codul apare în log-ul serverului, confirmarea cu codul corect, autentificarea automată după confirmare, intrarea separată cu emailul și parola după confirmare, cererea unui cod nou după 30 de secunde.
- Neverificat manual: cod greșit, cod expirat și trimiterea unui email real (fără `RESEND_API_KEY` emailul nu pleacă; codul se citește din log). Aceste cazuri sunt acoperite doar de testele automate.

## Decizii și limite

- Email real: opțional, prin Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Cu expeditorul de test `onboarding@resend.dev` livrarea merge doar către adresa contului Resend.
- Blocarea după 3 coduri greșite vine din valoarea implicită a bibliotecii; nu este cerută explicit în US-02.
- Pentru a vedea codul în testele automate, emailurile rămân în memorie când `NODE_ENV=test`, pentru că în baza de date există doar hash-ul.

## Fișiere principale

- `server/src/lib/auth.ts`, `server/src/lib/email.ts`, `server/.env.example`
- `mobile/src/app/(auth)/verify-email.tsx`, `mobile/src/components/code-input.tsx`, `mobile/src/lib/auth-client.ts`
- `server/tests/verify-email.test.ts`, `mobile/tests/verify-email.test.tsx`, `docs/test-cases/CA-02.md`
