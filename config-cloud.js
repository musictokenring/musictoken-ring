// Configuración de la aplicación MusicToken Ring
const CONFIG = {
    // Backend API URL - Usando backend público temporal
    BACKEND_API: 'https://musictoken-backend.vercel.app',
    
    // Blockchain Configuration
    CHAIN_ID: 80001,
    RPC_URL: 'https://polygon-mumbai.g.alchemy.com/v2/demo',
    
    // Smart Contracts
    CONTRACT_ADDRESS: '0xYourBattleContractAddress',
    TOKEN_ADDRESS: '0xYourTokenContractAddress',
    
    // App Configuration
    BATTLE_DURATION: 60,
    BURN_RATE: 0.005,
    MAX_BET: 10000,
}
```

### **4. Pégalo en Notepad (reemplaza todo)**

### **5. Guarda:**
```
Ctrl + S
Cierra Notepad
```

### **6. GitHub Desktop:**
```
1. Verás: config/config.js (new file o modified)
2. Summary: "Fix: Backend URL to cloud"
3. Commit to main
4. Push origin
```

### **7. Espera 30 seg → Vercel redeploy**

### **8. Prueba:**
```
www.musictokenring.com
Ctrl + F5
Busca "blinding lights"
```

---

## 🔍 **VERIFICACIÓN RÁPIDA:**

### **¿Existe la carpeta config?**

Ve a:
```
C:\Users\fmfil\Documents\GitHub\musictoken-ring
```

Mira si ves una carpeta llamada `config/`

**SI NO EXISTE:**
1. Click derecho → Nueva carpeta
2. Nombre: `config`
3. Entra a la carpeta
4. Click derecho → Nuevo → Documento de texto
5. Nombre: `config.js` (borra el .txt)
6. Pega el código de arriba

**SI SÍ EXISTE:**
1. Abre `config/config.js`
2. Reemplaza todo con el código de arriba

---

## 📸 **TOMA SCREENSHOT:**

De la carpeta:
```
C:\Users\fmfil\Documents\GitHub\musictoken-ring
```

Mostrando qué carpetas y archivos tienes, para verificar la estructura.

---

## ✅ **ESTRUCTURA CORRECTA DEBE SER:**
```
musictoken-ring/
├── config/
│   └── config.js       ← Este archivo debe tener la URL cloud
├── src/
│   └── app.js
├── styles/
│   └── main.css
├── index.html
└── README.md