# PAQUETE DE REGISTRO ANTE LA DNDA - MUSICTOKEN RING

## INFORMACIÓN GENERAL

**Nombre del Software:** MusicToken Ring  
**Versión:** 3.9  
**Fecha de Compilación:** 2026  
**Tipo de Software:** Plataforma Web de Batallas Musicales con Blockchain  
**Tecnologías:** JavaScript, Node.js, Express.js, Supabase, Viem, Web3  

## DESCRIPCIÓN DEL SOFTWARE

MusicToken Ring es una plataforma web innovadora que combina:
- Sistema de batallas musicales en tiempo real
- Integración con blockchain (Base Network)
- Sistema de créditos estables (1 crédito = 1 USDC)
- Múltiples modos de juego (Rápido, Social, Privado, Torneo, Práctica)
- Sistema de vault y liquidez automático
- Integración con wallets criptográficas
- Sistema de autenticación y gestión de usuarios

## ESTRUCTURA DEL PAQUETE

### 1. MUESTRAS DE CÓDIGO FUENTE (`muestras-codigo/`)

Contiene muestras representativas del código fuente que demuestran:
- Arquitectura del sistema
- Funcionalidades principales
- Integraciones clave
- Lógica de negocio

**Archivos incluidos:**
- `game-engine.js` - Motor principal del juego
- `auth-system.js` - Sistema de autenticación
- `credits-system.js` - Sistema de créditos estables
- `server-auto.js` - Backend automatizado
- `vault-service.js` - Servicio de vault y liquidez
- `deposit-listener.js` - Listener de depósitos blockchain
- `index.html` (muestra parcial) - Interfaz principal

**Nota:** Estos son archivos parciales seleccionados para protección. El código completo contiene aproximadamente 15,000+ líneas de código distribuido en múltiples archivos.

### 2. CAPTURAS DE INTERFAZ (`capturas/`)

**INSTRUCCIONES PARA CAPTURAS:**
Debes tomar capturas de pantalla de las siguientes secciones:

1. **Página Principal / Header**
   - Logo y nombre de la aplicación
   - Información de balances (MTR, créditos, USDC)
   - Estado de wallet conectada
   - Información de usuario

2. **Modo de Batalla Rápida**
   - Selección de canción
   - Interfaz de batalla en progreso
   - Resultados y ganancias

3. **Modo Social / Desafíos**
   - Creación de desafío
   - Lista de desafíos disponibles
   - Aceptación de desafío

4. **Modo Privado**
   - Creación de sala privada
   - Código de sala
   - Unirse a sala

5. **Modo Torneo**
   - Configuración de torneo
   - Tabla de posiciones
   - Premios

6. **Modo Práctica**
   - Interfaz de práctica
   - Balance de práctica

7. **Sistema de Depósitos**
   - Integración Ramp Network
   - Depósitos USDC
   - Historial de transacciones

8. **Sistema de Retiros**
   - Interfaz de retiro
   - Vault balance
   - Proceso de claim

9. **Autenticación**
   - Login con Google
   - Registro con email
   - Recuperación de contraseña

10. **Dashboard / Estadísticas**
    - Perfil de usuario
    - Historial de batallas
    - Estadísticas de rendimiento

**Formato recomendado:** PNG o JPG, mínimo 1920x1080px

### 3. DOCUMENTACIÓN (`documentacion/`)

- Este archivo README
- Diagrama de arquitectura (si aplica)
- Descripción de funcionalidades principales

## CARACTERÍSTICAS TÉCNICAS PRINCIPALES

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Framework: Vanilla JS con módulos
- UI: Tailwind CSS
- Integración Web3: Viem, WalletConnect
- Autenticación: Supabase Auth

### Backend
- Runtime: Node.js 18+
- Framework: Express.js
- Base de datos: Supabase (PostgreSQL)
- Blockchain: Base Network (Ethereum L2)
- Tokens: ERC-20 (MTR, USDC)

### Funcionalidades Clave Implementadas

1. **Sistema de Batallas Musicales**
   - Comparación de streams en tiempo real
   - Sistema de ELO para canciones
   - Múltiples modos de juego
   - Sistema de apuestas y premios

2. **Integración Blockchain**
   - Detección automática de depósitos
   - Conversión MTR a créditos estables
   - Retiros automáticos
   - Gestión de vault

3. **Sistema de Créditos Estables**
   - 1 crédito = 1 USDC (tasa fija)
   - Conversión automática
   - Gestión de balances

4. **Autenticación y Seguridad**
   - Login con Google OAuth
   - Registro con email/password
   - Recuperación de contraseña
   - Row Level Security (RLS) en base de datos

## NOTAS IMPORTANTES

- Este paquete contiene **muestras parciales** del código fuente para protección de derechos de autor
- El código completo contiene información sensible (API keys, URLs de producción) que no se incluye por seguridad
- Las capturas de pantalla deben ser tomadas del entorno de producción o staging
- Todos los archivos están organizados según los requisitos de la DNDA

## CONTACTO

Para consultas sobre este registro:
- Email: support@musictokenring.xyz
- Sitio web: https://musictokenring.xyz

---
**Fecha de preparación:** $(Get-Date -Format "yyyy-MM-dd")  
**Preparado por:** Equipo de Desarrollo MusicToken Ring
