# 🔄 Ghid: Redenumire Repository GitHub LARSTEF → voob

## Pași pentru redenumirea repository-ului

### 1. Redenumește Repository-ul pe GitHub

1. **Accesează repository-ul**: https://github.com/stefannadriann87/LARSTEF
2. **Settings** → Scroll la "Repository name"
3. **Schimbă numele** de la `LARSTEF` la `voob`
4. **Click "Rename"**

⚠️ **Notă**: După redenumire, URL-ul vechi va redirecționa automat la cel nou.

#### 🔧 Troubleshooting: Dacă nu se salvează redenumirea

**Probleme comune și soluții:**

1. **Verifică permisiunile**:
   - Asigură-te că ești **owner** al repository-ului
   - Dacă ești colaborator, nu poți redenumi

2. **Verifică dacă numele este disponibil**:
   - Poate `voob` este deja luat de altcineva
   - Încearcă: `voob-platform`, `voob-app`, `voob-booking`

3. **Verifică validarea numelui**:
   - Numele trebuie să fie între 1-100 caractere
   - Poate conține doar litere, cifre, `-`, `_`, `.`
   - Nu poate începe sau se termina cu `.` sau `-`

4. **Clear cache și reîncarcă**:
   - Hard refresh: `Cmd+Shift+R` (Mac) sau `Ctrl+Shift+R` (Windows)
   - Sau șterge cache-ul browser-ului
   - Încearcă în alt browser (Chrome, Firefox, Safari)

5. **Verifică dacă există restricții**:
   - Verifică dacă există branch protection rules care blochează
   - Verifică dacă există GitHub Actions care rulează (opțional: oprește-le temporar)

6. **Verifică statusul GitHub**:
   - Accesează: https://www.githubstatus.com/
   - Dacă există probleme, așteaptă și încearcă din nou

7. **Alternativă: Creează repository nou**:
   - Dacă redenumirea nu funcționează, poți crea un repository nou:
     - New repository → Nume: `voob`
     - **NU** adăuga README, .gitignore sau license
     - Click "Create repository"
   - Apoi push codul:
     ```bash
     git remote add new-origin https://github.com/stefannadriann87/voob.git
     git push new-origin main
     git push new-origin staging
     # Șterge remote-ul vechi
     git remote remove origin
     git remote rename new-origin origin
     ```

### 2. Actualizează Remote-ul Local

După ce ai redenumit repository-ul pe GitHub, actualizează remote-ul local:

```bash
# Verifică remote-ul actual
git remote -v

# Actualizează URL-ul remote
git remote set-url origin https://github.com/stefannadriann87/voob.git

# Verifică că s-a actualizat
git remote -v
```

### 3. Redenumește Folder-ul Local

**Metodă 1: Din Finder (Recomandat - mai simplu)**

1. **Închide Cursor** complet (Cmd+Q)
2. **Deschide Finder** și navighează la `/Users/stefanadrian/development/`
3. **Click dreapta** pe folderul `LARSTEF` → **Rename**
4. **Schimbă numele** la `voob`
5. **Redeschide Cursor** și deschide proiectul din noul folder `voob`

**Metodă 2: Din Terminal (Alternativă)**

```bash
# Navighează în folderul părinte
cd /Users/stefanadrian/development/

# Redenumește folderul
mv LARSTEF voob

# Intră în folderul nou
cd voob
```

⚠️ **Notă**: După redenumire, dacă Cursor deschide automat proiectul vechi, închide-l și deschide manual noul folder `voob`.

### 4. Verifică că Totul Funcționează

```bash
# Testează conexiunea
git fetch origin

# Verifică branch-urile
git branch -a

# Testează push
git push origin main
```

## ✅ Ce am actualizat deja

- ✅ Workflow-urile GitHub Actions folosesc `${{ github.repository }}` - se actualizează automat
- ✅ AWS_DEPLOY_GUIDE.md - actualizat cu URL-ul corect: `stefannadriann87/voob`

## 📝 După Redenumire

După ce ai redenumit repository-ul:

1. **Actualizează remote-ul local** (vezi pasul 2)
2. **Verifică GitHub Secrets** - nu trebuie schimbate (folosesc repository-ul automat)
3. **Testează deploy** - push la `staging` sau `main` pentru a verifica că workflow-urile funcționează

## 🔗 Link-uri

- **Repository vechi** (va redirecționa): https://github.com/stefannadriann87/LARSTEF
- **Repository nou**: https://github.com/stefannadriann87/voob

