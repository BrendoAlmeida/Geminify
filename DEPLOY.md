# 🎵 Geminify - Deploy para Produção

## 🚀 Deploy no Render (Recomendado)

### Pré-requisitos
1. Conta no [Render](https://render.com)
2. Repositório GitHub com o código
3. Chaves de API do Spotify e Gemini

### 1. Configurar Spotify App

1. Acesse [Spotify for Developers](https://developer.spotify.com/dashboard)
2. Crie um novo aplicativo  
3. Configure as **Redirect URIs**:
   - `https://your-app-name.onrender.com/callback`
4. Anote o **Client ID** e **Client Secret**

### 2. Deploy no Render

1. **Conecte seu repositório**:
   - Acesse [Render Dashboard](https://dashboard.render.com/)
   - Clique em "New +" → "Web Service"
   - Conecte sua conta GitHub e selecione o repositório

2. **Configure o serviço**:
   - **Name**: `geminify` (ou nome de sua escolha)
   - **Environment**: `Node`
   - **Build Command**: `npm install` (deixe como padrão)
   - **Start Command**: `npm start`
   - **Node Version**: `18.x` ou superior

### 3. Configurar Variáveis de Ambiente

No painel do Render, adicione as seguintes Environment Variables:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret  
SPOTIFY_REDIRECT_URI=https://your-app-name.onrender.com/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=your-super-secure-random-string
NODE_ENV=production
PORT=3000
```

**🔐 Para gerar SESSION_SECRET seguro:**
```bash
# No terminal local
node -p "require('crypto').randomBytes(32).toString('hex')"
```

## Deploy Passo a Passo

### 1. Preparar o Servidor

```bash
# Instalar Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente para gerenciar o processo
sudo npm install -g pm2
```

### 2. Clonar e Configurar o Projeto

```bash
# Clonar o repositório
git clone <seu-repositorio>
cd geminify

# Instalar dependências
npm install

# Copiar e configurar variáveis de ambiente
cp .env.example .env
```

### 3. Configurar Variáveis de Ambiente

Edite o arquivo `.env` com suas configurações:

```env
# Spotify Configuration
SPOTIFY_CLIENT_ID=seu_client_id_aqui
SPOTIFY_CLIENT_SECRET=seu_client_secret_aqui
SPOTIFY_REDIRECT_URI=https://seudominio.com/callback

# Gemini Configuration
GEMINI_API_KEY=sua_api_key_aqui

# Session Configuration (IMPORTANTE: Gerar uma chave segura!)
SESSION_SECRET=uma-chave-muito-longa-e-aleatoria-para-producao

# Server Configuration
NODE_ENV=production
PORT=3000
```

**⚠️ IMPORTANTE**: Gere uma SESSION_SECRET segura:
```bash
# Linux/Mac
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach {Get-Random -Maximum 256}))
```

### 4. Build e Deploy

```bash
# Build para produção
npm run build:prod

# Iniciar com PM2
pm2 start dist/server.js --name "geminify"

# Salvar configuração do PM2
pm2 startup
pm2 save
```

### 5. Configurar Nginx (Recomendado)

Crie `/etc/nginx/sites-available/geminify`:

```nginx
server {
    listen 80;
    server_name seudominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seudominio.com;
    
    # SSL Configuration (use certbot para Let's Encrypt)
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Ativar o site:
```bash
sudo ln -s /etc/nginx/sites-available/geminify /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Configurar SSL com Let's Encrypt

```bash
# Instalar certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d seudominio.com

# Verificar renovação automática
sudo certbot renew --dry-run
```

## Monitoramento e Manutenção

### Comandos PM2 Úteis

```bash
# Ver status
pm2 status

# Ver logs
pm2 logs geminify

# Reiniciar
pm2 restart geminify

# Atualizar aplicação
git pull
npm install
npm run build:prod
pm2 restart geminify
```

### Backup e Logs

```bash
# Configurar rotação de logs
pm2 install pm2-logrotate

# Verificar logs do sistema
sudo journalctl -u nginx -f
```

## Checklist Final

- [ ] ✅ Domínio configurado e apontando para o servidor
- [ ] ✅ SSL/HTTPS configurado
- [ ] ✅ Variáveis de ambiente configuradas
- [ ] ✅ Spotify App configurado com URL de callback correto
- [ ] ✅ PM2 rodando e configurado para reiniciar automaticamente
- [ ] ✅ Nginx configurado como proxy reverso
- [ ] ✅ Firewall configurado (portas 80, 443 abertas)
- [ ] ✅ Monitoramento de recursos configurado

## Solução de Problemas

### Erro 403 - Forbidden
- Verifique se o SPOTIFY_REDIRECT_URI no .env corresponde exatamente ao configurado no Spotify Dashboard

### Erro de Sessão
- Certifique-se de que SESSION_SECRET está configurado e é seguro

### Erro 502 - Bad Gateway
- Verifique se a aplicação está rodando: `pm2 status`
- Verifique os logs: `pm2 logs geminify`

### Performance
- Monitore uso de CPU/RAM: `pm2 monit`
- Considere usar Redis para sessões em alta escala

## Segurança

⚠️ **Importantes medidas de segurança implementadas:**

- Rate limiting (100 requests/15min por IP)
- Rate limiting específico para auth (10 attempts/15min)
- Helmet.js para headers de segurança
- Sessões seguras com HttpOnly cookies
- HTTPS obrigatório em produção
- Validação de state no OAuth