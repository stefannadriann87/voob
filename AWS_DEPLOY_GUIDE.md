# 🚀 Ghid Complet: Deploy VOOB pe AWS

Acest ghid te va ajuta să deploy-ezi platforma VOOB pe AWS cu pipeline CI/CD, medii de staging și production.

## 📋 Arhitectura Recomandată

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                    (voob-platform)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ GitHub Actions (CI/CD)
                       │
        ┌──────────────┴──────────────┐
        │                              │
   ┌────▼────┐                   ┌─────▼─────┐
   │ Staging │                   │ Production│
   └────┬────┘                   └─────┬─────┘
        │                              │
   ┌────▼──────────────────────────────▼────┐
   │         AWS Infrastructure              │
   │                                         │
   │  ┌──────────┐      ┌──────────┐       │
   │  │   EC2     │      │   RDS    │       │
   │  │ (Backend) │◄────►│PostgreSQL│       │
   │  └────┬──────┘      └──────────┘       │
   │       │                                 │
   │  ┌────▼──────┐     ┌──────────┐       │
   │  │  S3 +     │     │CloudFront │       │
   │  │CloudFront │◄────┤  (CDN)    │       │
   │  │(Frontend) │     └──────────┘       │
   │  └───────────┘                         │
   │                                         │
   │  ┌──────────┐      ┌──────────┐       │
   │  │  Route53 │      │  ACM     │       │
   │  │ (DNS)    │◄────►│  (SSL)   │       │
   │  └──────────┘      └──────────┘       │
   └─────────────────────────────────────────┘
```

## 🎯 Medii de Deploy

- **Staging**: `staging.voob.io` - Pentru testare înainte de production
- **Production**: `voob.io` - Mediu live

---

## 📝 Faza 1: Setup AWS Infrastructure

### 1.1. Creează Cont AWS și Configurează CLI

1. **Creează cont AWS** (dacă nu ai): https://aws.amazon.com/
2. **Instalează AWS CLI**:
   ```bash
   # macOS
   brew install awscli
   
   # Sau download de la: https://aws.amazon.com/cli/
   ```
3. **Configurează AWS CLI**:
   ```bash
   aws configure
   # AWS Access Key ID: [your-access-key]
   # AWS Secret Access Key: [your-secret-key]
   # Default region: eu-central-1 (sau eu-west-1)
   # Default output format: json
   ```

### 1.2. Creează RDS PostgreSQL Database

1. **Accesează AWS Console**: https://console.aws.amazon.com/rds/
2. **Create database**:
   - **Engine**: PostgreSQL (versiunea 15.x sau 16.x)
   - **Template**: Production (sau Dev/Test pentru staging)
   - **DB instance identifier**: `voob-production-db` (sau `voob-staging-db`)
   - **Master username**: `voob_admin`
   - **Master password**: Generează un password puternic
   - **DB instance class**: `db.t3.micro` (pentru început) sau `db.t3.small`
   - **Storage**: 20 GB (minim)
   - **VPC**: Creează un VPC nou sau folosește default
   - **Public access**: **NO** (pentru securitate)
   - **VPC security group**: Creează unul nou
   - **Database name**: `voob`
   - **Backup retention**: 7 days
   - Click **Create database**

3. **Notează Endpoint**: Va arăta ca `voob-production-db.xxxxx.eu-central-1.rds.amazonaws.com:5432`

4. **Modifică Security Group**:
   - Accesează RDS → Database → Security
   - Click pe Security Group
   - Inbound rules → Add rule:
     - Type: PostgreSQL
     - Port: 5432
     - Source: IP-ul EC2 instance (sau Security Group-ul EC2)

### 1.3. Creează EC2 Instance pentru Backend

1. **Accesează EC2 Console**: https://console.aws.amazon.com/ec2/
2. **Launch instance**:
   - **Name**: `voob-backend-production` (sau `voob-backend-staging`)
   - **AMI**: Amazon Linux 2023 (sau Ubuntu 22.04 LTS)
   - **Instance type**: `t3.small` (2 vCPU, 2 GB RAM) - minim pentru Node.js
   - **Key pair**: Creează unul nou sau folosește existent
   - **Network settings**: 
     - VPC: Același ca RDS
     - Subnet: Public subnet
     - Auto-assign public IP: Enable
     - Security group: Creează unul nou:
       - SSH (22): Your IP
       - HTTP (80): 0.0.0.0/0
       - HTTPS (443): 0.0.0.0/0
       - **Notă**: Dacă nu poți adăuga Custom TCP (4000) aici, o vei adăuga după crearea instanței (vezi pasul 3)
   - **Storage**: 20 GB gp3
   - Click **Launch instance**

3. **Adaugă regula Custom TCP (4000) în Security Group** (dacă nu ai putut-o adăuga la pasul 2):
   - Mergi la **EC2 Console** → **Security Groups** (în meniul din stânga)
   - Selectează security group-ul creat (de ex. `launch-wizard-1`)
   - Tab **Inbound rules** → Click **Edit inbound rules**
   - Click **Add rule**:
     - **Type**: Custom TCP
     - **Port**: 4000
     - **Source**: 0.0.0.0/0
     - **Description**: "Backend API"
   - Click **Save rules**

4. **Notează Public IP** și **Public DNS**

### 1.4. Creează S3 Bucket pentru Frontend

1. **Accesează S3 Console**: https://console.aws.amazon.com/s3/
2. **Create bucket**:
   - **Bucket name**: `voob-frontend-production` (sau `voob-frontend-staging`)
   - **Region**: Același ca EC2
   - **Block Public Access**: **Uncheck** (necesar pentru hosting static)
   - **Bucket Versioning**: Enable (opțional)
   - Click **Create bucket**

3. **Configurează Static Website Hosting**:
   - Selectează bucket → Properties
   - Scroll la "Static website hosting" → Edit
   - Enable: Static website hosting
   - Index document: `index.html`
   - Error document: `404.html`
   - Save

4. **Bucket Policy** (pentru acces public):
   - Selectează bucket-ul → Tab **Permissions**
   - Scroll la secțiunea **Bucket policy** → Click **Edit**
   - Adaugă următorul JSON (înlocuiește `voob-frontend-production` cu numele bucket-ului tău):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::voob-frontend-production/*"
       }
     ]
   }
   ```
   - Click **Save changes**

### 1.5. Creează CloudFront Distribution

1. **Accesează CloudFront Console**: https://console.aws.amazon.com/cloudfront/
2. **Create distribution**:
   - **Origin domain**: Selectează S3 bucket-ul (`voob-frontend-production.s3.eu-central-1.amazonaws.com`)
   - **Origin access**: Public (sau Origin Access Control dacă vrei mai multă securitate)
   - **Viewer protocol policy**: Redirect HTTP to HTTPS
   - **Allowed HTTP methods**: GET, HEAD, OPTIONS
   - **Cache policy**: CachingOptimized
   - **Alternate domain names (CNAMEs)**: 
     - Production: `voob.io`, `www.voob.io`
     - Staging: `staging.voob.io`
   - **SSL certificate**: Request or import a certificate (vezi secțiunea 1.6)
   - Click **Create distribution**

3. **Notează Distribution Domain Name**: `d1234567890.cloudfront.net`

### 1.6. Request SSL Certificate (ACM)

1. **Accesează ACM Console**: https://console.aws.amazon.com/acm/
2. **Request certificate**:
   - **Domain names**:
     - `voob.io`
     - `*.voob.io` (wildcard pentru subdomain-uri)
   - **Validation method**: DNS validation
   - Click **Request**

3. **Validate Certificate**:
   - După ce ceri certificatul, ACM va genera CNAME records pentru validare
   - **Pași detaliați pentru GoDaddy**:
     1. În ACM Console, selectează certificatul cu status "Pending validation"
     2. Click pe certificat → vezi secțiunea "Domains" sau "Create record in Route 53"
     3. Vei vedea 2 înregistrări CNAME (una pentru `voob.io`, una pentru `*.voob.io`)
     4. Pentru fiecare înregistrare:
        - **Name**: Copiază partea înainte de `.voob.io` (ex: `_0599af3e8ecf5a21adfeb8666618832f`)
        - **Value**: Copiază valoarea completă cu `.aws.` la final (ex: `_7834193cc5fc85ab13b766218cd9ceb4.validations.aws.`)
     5. Mergi în GoDaddy DNS Management: https://dcc.godaddy.com/manage/voob.io/dns
     6. Adaugă fiecare CNAME record:
        - Type: **CNAME**
        - Name: valoarea din ACM (fără `.voob.io`)
        - Value: valoarea completă din ACM (cu `.aws.` la final)
        - TTL: 1 Hour
        - Click **Save**
     7. **IMPORTANT**: Asigură-te că valoarea CNAME se termină cu `.aws.` (nu uita punctul final!)
   - Așteaptă validarea (poate dura 5-30 minute după propagarea DNS)
   - Statusul va trece de la "Pending validation" la "Issued" când este validat

### 1.7. Configurează DNS (Route53 sau GoDaddy)

#### Opțiunea A: Dacă folosești Route53 (AWS DNS)

1. **Accesează Route53 Console**: https://console.aws.amazon.com/route53/
2. **Creează Hosted Zone** (dacă nu ai):
   - **Domain name**: `voob.io`
   - Click **Create hosted zone**

3. **Adaugă Records**:
   - **A Record pentru root domain**:
     - Name: (blank sau @)
     - Type: A
     - Alias: Yes
     - Route traffic to: CloudFront distribution
     - Selectează distribution-ul tău
     - Click **Create records**
   
   - **A Record pentru www**:
     - Name: www
     - Type: A
     - Alias: Yes
     - Route traffic to: CloudFront distribution
     - Selectează distribution-ul tău
     - Click **Create records**

4. **Update Name Servers**:
   - Route53 va genera 4 name servers
   - Copiază-le și adaugă-le la provider-ul tău de domeniu (unde ai cumpărat voob.io)
   - Așteaptă propagarea (poate dura până la 48h, de obicei 1-2h)

#### Opțiunea B: Dacă folosești GoDaddy (sau alt provider DNS)

**IMPORTANT:** Înainte de a configura DNS-ul, asigură-te că:
1. Certificatul ACM este validat (status "Issued")
2. CloudFront distribution are configurate:
   - Alternate domain names: `voob.io` și `www.voob.io`
   - Custom SSL certificate: certificatul validat din ACM

**Pași pentru GoDaddy:**

1. **Accesează GoDaddy DNS Management**: https://dcc.godaddy.com/manage/voob.io/dns
2. **Adaugă record-uri pentru CloudFront**:
   
   - **Pentru root domain (`voob.io`)**:
     - Type: **CNAME** (GoDaddy nu permite A record cu alias pentru CloudFront)
     - Name: `@` (sau lasă gol pentru root domain)
     - Value: `d2e0i25luz11uj.cloudfront.net` (înlocuiește cu Distribution Domain Name-ul tău)
     - TTL: 1 Hour
     - Click **Save**
   
   - **Pentru www (`www.voob.io`)**:
     - Type: **CNAME**
     - Name: `www`
     - Value: `d2e0i25luz11uj.cloudfront.net` (înlocuiește cu Distribution Domain Name-ul tău)
     - TTL: 1 Hour
     - Click **Save**

3. **Notă importantă pentru GoDaddy**:
   - GoDaddy nu permite CNAME pentru root domain (@) dacă există deja A record
   - Dacă ai un A record pentru @, șterge-l sau editează-l
   - Alternativ, poți folosi un A record care să pointeze către IP-ul CloudFront (nu este recomandat, deoarece IP-urile CloudFront se schimbă)

4. **Așteaptă propagarea DNS**:
   - Poate dura câteva minute până la câteva ore
   - Verifică cu: `nslookup voob.io` sau `dig voob.io`

---

## 📝 Faza 2: Setup GitHub Actions CI/CD

### 2.1. Creează GitHub Secrets

1. **Accesează GitHub Repository**: Settings → Secrets and variables → Actions
2. **Adaugă următoarele secrets**:

#### Secrets pentru Staging:
```
AWS_ACCESS_KEY_ID_STAGING
AWS_SECRET_ACCESS_KEY_STAGING
AWS_REGION_STAGING (ex: eu-central-1)
EC2_HOST_STAGING (Public IP sau DNS)
EC2_USER_STAGING (ec2-user pentru Amazon Linux, ubuntu pentru Ubuntu)
EC2_SSH_KEY_STAGING (conținutul private key, fără passphrase)
RDS_ENDPOINT_STAGING
RDS_DATABASE_STAGING
RDS_USERNAME_STAGING
RDS_PASSWORD_STAGING
S3_BUCKET_FRONTEND_STAGING
CLOUDFRONT_DISTRIBUTION_ID_STAGING
```

#### Secrets pentru Production:
```
AWS_ACCESS_KEY_ID_PRODUCTION
AWS_SECRET_ACCESS_KEY_PRODUCTION
AWS_REGION_PRODUCTION
EC2_HOST_PRODUCTION
EC2_USER_PRODUCTION
EC2_SSH_KEY_PRODUCTION
RDS_ENDPOINT_PRODUCTION
RDS_DATABASE_PRODUCTION
RDS_USERNAME_PRODUCTION
RDS_PASSWORD_PRODUCTION
S3_BUCKET_FRONTEND_PRODUCTION
CLOUDFRONT_DISTRIBUTION_ID_PRODUCTION
```

#### Secrets comune (pentru ambele medii):
```
DATABASE_URL_STAGING (postgresql://user:pass@endpoint:5432/voob)
DATABASE_URL_PRODUCTION
JWT_SECRET
RECAPTCHA_SECRET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SMSADVERT_API_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
OPENAI_API_KEY (opțional)
```

### 2.2. Creează GitHub Actions Workflows

Creează folderul `.github/workflows/` în root-ul proiectului:

#### `.github/workflows/deploy-staging.yml`
```yaml
name: Deploy to Staging

on:
  push:
    branches:
      - staging
  workflow_dispatch:

env:
  NODE_VERSION: '22.x'
  AWS_REGION: ${{ secrets.AWS_REGION_STAGING }}

jobs:
  deploy-backend:
    name: Deploy Backend to Staging
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Build backend
        run: |
          cd backend
          npm run build || echo "No build script, skipping"

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.EC2_SSH_KEY_STAGING }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.EC2_HOST_STAGING }} >> ~/.ssh/known_hosts

      - name: Deploy to EC2
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.EC2_USER_STAGING }}@${{ secrets.EC2_HOST_STAGING }} << 'EOF'
            # Create app directory
            mkdir -p /home/$USER/voob-backend
            cd /home/$USER/voob-backend
            
            # Pull latest code
            git pull origin staging || git clone https://github.com/stefannadriann87/voob.git .
            
            # Install dependencies
            cd backend
            npm ci --production
            
            # Run Prisma migrations
            npx prisma migrate deploy
            npx prisma generate
            
            # Restart application (using PM2)
            pm2 restart voob-backend || pm2 start npm --name "voob-backend" -- start
          EOF

  deploy-frontend:
    name: Deploy Frontend to Staging
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Build frontend
        env:
          NEXT_PUBLIC_RECAPTCHA_SITE_KEY: ${{ secrets.NEXT_PUBLIC_RECAPTCHA_SITE_KEY }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: ${{ secrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY }}
        run: |
          cd frontend
          npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_STAGING }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_STAGING }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to S3
        run: |
          cd frontend
          aws s3 sync out/ s3://${{ secrets.S3_BUCKET_FRONTEND_STAGING }} --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID_STAGING }} \
            --paths "/*"
```

#### `.github/workflows/deploy-production.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  NODE_VERSION: '22.x'
  AWS_REGION: ${{ secrets.AWS_REGION_PRODUCTION }}

jobs:
  deploy-backend:
    name: Deploy Backend to Production
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Build backend
        run: |
          cd backend
          npm run build || echo "No build script, skipping"

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.EC2_SSH_KEY_PRODUCTION }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.EC2_HOST_PRODUCTION }} >> ~/.ssh/known_hosts

      - name: Deploy to EC2
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.EC2_USER_PRODUCTION }}@${{ secrets.EC2_HOST_PRODUCTION }} << 'EOF'
            mkdir -p /home/$USER/voob-backend
            cd /home/$USER/voob-backend
            git pull origin main || git clone https://github.com/stefannadriann87/voob.git .
            cd backend
            npm ci --production
            npx prisma migrate deploy
            npx prisma generate
            pm2 restart voob-backend || pm2 start npm --name "voob-backend" -- start
          EOF

  deploy-frontend:
    name: Deploy Frontend to Production
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Build frontend
        env:
          NEXT_PUBLIC_RECAPTCHA_SITE_KEY: ${{ secrets.NEXT_PUBLIC_RECAPTCHA_SITE_KEY }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: ${{ secrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY }}
        run: |
          cd frontend
          npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_PRODUCTION }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PRODUCTION }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to S3
        run: |
          cd frontend
          aws s3 sync out/ s3://${{ secrets.S3_BUCKET_FRONTEND_PRODUCTION }} --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID_PRODUCTION }} \
            --paths "/*"
```

---

## 📝 Faza 3: Setup EC2 Instance

### 3.1. Conectează-te la EC2

```bash
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
# sau pentru Ubuntu:
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### 3.2. Instalează Dependencies

```bash
# Update system
sudo yum update -y  # Amazon Linux
# sau
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Node.js 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs  # Amazon Linux
# sau pentru Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git
sudo yum install -y git  # Amazon Linux
# sau
sudo apt install -y git  # Ubuntu

# Install PostgreSQL client (pentru debugging)
sudo yum install -y postgresql15  # Amazon Linux
# sau
sudo apt install -y postgresql-client  # Ubuntu
```

### 3.3. Clonează Repository și Configurează

```bash
# Clone repository
cd ~
git clone https://github.com/stefannadriann87/voob.git voob-backend
cd voob-backend/backend

# Install dependencies
npm ci --production

# Create .env file
nano .env
# Adaugă toate variabilele de mediu (vezi CONFIGURARE_KEYS_VOOB.md)

# Run Prisma migrations
npx prisma migrate deploy
npx prisma generate
```

### 3.4. Configurează PM2

```bash
# Create PM2 ecosystem file
nano ~/voob-backend/backend/ecosystem.config.js
```

Conținut `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'voob-backend',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--loader ts-node/esm',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
```

```bash
# Start application
cd ~/voob-backend/backend
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Rulând comanda afișată de PM2
```

### 3.5. Configurează Nginx (Reverse Proxy)

```bash
# Install Nginx
sudo yum install -y nginx  # Amazon Linux
# sau
sudo apt install -y nginx  # Ubuntu

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

Creează config Nginx:
```bash
sudo nano /etc/nginx/conf.d/voob-backend.conf
```

Conținut:
```nginx
server {
    listen 80;
    server_name api.voob.io;  # sau staging-api.voob.io

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 📝 Faza 4: Configurează Next.js pentru Static Export

### 4.1. Actualizează `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',  // Pentru static export
  images: {
    unoptimized: true,  // Necesar pentru static export
  },
  trailingSlash: true,
  // Adaugă dacă ai API routes care trebuie să meargă la backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.voob.io/:path*',  // Sau staging-api.voob.io
      },
    ];
  },
};

export default nextConfig;
```

### 4.2. Actualizează API Base URL în Frontend

Verifică `frontend/src/hooks/useApi.ts` și asigură-te că folosește:
- Production: `https://api.voob.io`
- Staging: `https://staging-api.voob.io`

---

## 📝 Faza 5: Configurare Finală

### 5.1. Update Stripe Webhooks

1. **Staging Webhook**:
   - URL: `https://staging-api.voob.io/webhooks/stripe`
   - Copiază signing secret → `STRIPE_WEBHOOK_SECRET` în staging secrets

2. **Production Webhook**:
   - URL: `https://api.voob.io/webhooks/stripe`
   - Copiază signing secret → `STRIPE_WEBHOOK_SECRET` în production secrets

### 5.2. Update Google reCAPTCHA

Adaugă domeniile în Google reCAPTCHA:
- `voob.io`
- `staging.voob.io`
- `api.voob.io`
- `staging-api.voob.io`

### 5.3. Update Google Maps API

Restricționează API key la:
- `https://voob.io/*`
- `https://staging.voob.io/*`
- `https://*.voob.io/*`

### 5.4. Test Deploy

1. **Push la branch staging**:
   ```bash
   git checkout -b staging
   git push origin staging
   ```
   - Verifică GitHub Actions → Ar trebui să ruleze deploy
   - Accesează `staging.voob.io` după deploy

2. **Push la branch main** (production):
   ```bash
   git checkout main
   git push origin main
   ```
   - Verifică GitHub Actions
   - Accesează `voob.io` după deploy

---

## 📋 Checklist Final

### Infrastructure:
- [ ] RDS PostgreSQL creat (staging + production)
- [ ] EC2 instances create (staging + production)
- [ ] S3 buckets create (staging + production)
- [ ] CloudFront distributions create (staging + production)
- [ ] ACM SSL certificates requestate și validate
- [ ] Route53 DNS configurat
- [ ] Security Groups configurate corect

### GitHub:
- [ ] Repository creat pe GitHub
- [ ] Toate secrets adăugate în GitHub
- [ ] Workflow files create (`.github/workflows/`)
- [ ] Branches create: `staging` și `main`

### EC2:
- [ ] Node.js instalat
- [ ] PM2 instalat și configurat
- [ ] Nginx instalat și configurat
- [ ] Application rulează cu PM2
- [ ] Nginx reverse proxy funcționează

### Testing:
- [ ] Staging deploy funcționează
- [ ] Production deploy funcționează
- [ ] Database connections funcționează
- [ ] API endpoints accesibile
- [ ] Frontend static files servite corect
- [ ] SSL/HTTPS funcționează
- [ ] Stripe webhooks funcționează
- [ ] Email sending funcționează

---

## 🔧 Comenzi Utile

### PM2 Management:
```bash
pm2 list
pm2 logs voob-backend
pm2 restart voob-backend
pm2 stop voob-backend
pm2 monit
```

### Database Migrations:
```bash
cd ~/voob-backend/backend
npx prisma migrate deploy
npx prisma generate
npx prisma studio  # Pentru debugging
```

### Nginx:
```bash
sudo nginx -t  # Test config
sudo systemctl reload nginx  # Reload
sudo systemctl status nginx  # Status
```

### CloudFront Invalidation:
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

---

## 💰 Estimare Costuri AWS (lunar)

- **EC2 t3.small**: ~$15-20/lună
- **RDS db.t3.micro**: ~$15-20/lună
- **S3 Storage**: ~$0.50/lună (pentru 20GB)
- **CloudFront**: ~$1-5/lună (primul 1TB e gratuit)
- **Route53**: ~$0.50/lună (per hosted zone)
- **Data Transfer**: ~$5-10/lună
- **Total estimat**: ~$40-60/lună pentru staging + production

---

## 🆘 Troubleshooting

### Backend nu pornește:
```bash
# Verifică logs
pm2 logs voob-backend
# Verifică .env
cat ~/voob-backend/backend/.env
# Verifică port
netstat -tulpn | grep 4000
```

### Database connection failed:
- Verifică Security Group-ul RDS permite conexiuni de la EC2
- Verifică DATABASE_URL în .env
- Testează conexiunea: `psql -h RDS_ENDPOINT -U USERNAME -d DATABASE`

### Frontend nu se încarcă:
- Verifică S3 bucket permissions
- Verifică CloudFront distribution status
- Verifică DNS propagation: `dig voob.io`

---

## 📚 Resurse Suplimentare

- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [AWS RDS Documentation](https://docs.aws.amazon.com/rds/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)

---

**Notă**: Acest ghid presupune un setup de bază. Pentru production la scară, consideră:
- Load balancers (ALB)
- Auto Scaling Groups
- Multiple EC2 instances
- Database read replicas
- Redis ElastiCache pentru caching
- CloudWatch pentru monitoring
- WAF pentru securitate

