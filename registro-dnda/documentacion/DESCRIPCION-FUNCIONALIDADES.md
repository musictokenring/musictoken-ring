# DESCRIPCIÓN DE FUNCIONALIDADES - MUSICTOKEN RING

## RESUMEN EJECUTIVO

MusicToken Ring es una plataforma web innovadora que combina batallas musicales en tiempo real con tecnología blockchain, permitiendo a los usuarios apostar, competir y ganar premios mientras disfrutan de su música favorita.

## FUNCIONALIDADES PRINCIPALES

### 1. SISTEMA DE BATALLAS MUSICALES

#### 1.1 Modo Rápido
- Los usuarios seleccionan una canción de su biblioteca
- El sistema empareja automáticamente con otro jugador
- Se comparan los streams en tiempo real de ambas canciones
- El ganador recibe el premio del pozo (menos fee del 2%)
- Duración de batalla: 60 segundos

#### 1.2 Modo Social / Desafíos
- Los usuarios pueden crear desafíos públicos
- Otros usuarios pueden aceptar desafíos disponibles
- Cada desafío tiene una apuesta mínima de 5 créditos
- El creador del desafío selecciona su canción primero
- El aceptante selecciona su canción para competir

#### 1.3 Modo Privado
- Los usuarios crean salas privadas con código único
- Comparten el código con amigos para unirse
- Batallas uno contra uno en ambiente privado
- Ideal para competencias entre conocidos

#### 1.4 Modo Torneo
- Torneos con múltiples participantes
- Sistema de eliminación o puntos acumulados
- Prize pools más grandes
- Tabla de posiciones en tiempo real

#### 1.5 Modo Práctica
- Modo gratuito sin apuestas reales
- Balance de práctica de 1000 créditos virtuales
- Permite aprender el sistema sin riesgo
- No afecta el balance real del usuario

### 2. INTEGRACIÓN BLOCKCHAIN

#### 2.1 Detección Automática de Depósitos
- El sistema monitorea constantemente la blockchain de Base Network
- Detecta automáticamente transferencias de MTR y USDC
- Acredita créditos automáticamente al usuario
- Sin necesidad de confirmación manual

#### 2.2 Conversión de Tokens
- Los usuarios depositan MTR (MusicToken) o USDC
- El sistema convierte automáticamente a créditos estables
- Tasa fija: 1 crédito = 1 USDC
- Los créditos son estables y no fluctúan

#### 2.3 Gestión de Wallet
- Conexión con múltiples wallets (MetaMask, Binance Wallet, WalletConnect)
- Verificación automática de red (Base Network - Chain ID 8453)
- Cambio automático de red si es necesario
- Soporte para dispositivos móviles

### 3. SISTEMA DE CRÉDITOS ESTABLES

#### 3.1 Conversión Estable
- 1 crédito = 1 USDC (tasa fija, no variable)
- Los créditos no fluctúan con el precio de MTR
- Facilita el cálculo de apuestas y premios
- Sistema predecible para usuarios

#### 3.2 Gestión de Balances
- Balance on-chain: MTR en wallet del usuario
- Balance de créditos: Créditos estables en la plataforma
- Balance jugable: Créditos disponibles para apostar
- Actualización en tiempo real

### 4. SISTEMA DE VAULT Y LIQUIDEZ

#### 4.1 Acumulación de Fees
- Fee de depósito: 5%
- Fee de apuesta: 2%
- Fee de retiro: 5%
- Todos los fees se acumulan en el vault

#### 4.2 Gestión Automática
- El vault mantiene liquidez para pagar retiros
- Retiros automáticos cuando el usuario solicita
- Mínimo de retiro: 5 créditos
- Procesamiento en tiempo real

### 5. AUTENTICACIÓN Y SEGURIDAD

#### 5.1 Métodos de Autenticación
- Login con Google OAuth
- Registro con email y contraseña
- Recuperación de contraseña por email
- Sesiones persistentes

#### 5.2 Seguridad de Datos
- Row Level Security (RLS) en base de datos
- Encriptación de contraseñas
- Validación de entrada de datos
- Protección contra ataques comunes

### 6. INTEGRACIÓN CON RAMP NETWORK

#### 6.1 Compra de USDC
- Widget integrado de Ramp Network
- Compra directa de USDC con fiat (COP, USD, etc.)
- Proceso simplificado para usuarios nuevos
- Soporte para múltiples métodos de pago

#### 6.2 Flujo Automatizado
- Después de comprar en Ramp, el usuario transfiere USDC a la plataforma
- El sistema detecta automáticamente el depósito
- Acredita créditos al usuario
- Todo el proceso es automatizado

### 7. INTERFAZ DE USUARIO

#### 7.1 Diseño Moderno
- Interfaz oscura con efectos neon
- Diseño responsive para móviles y desktop
- Animaciones suaves y transiciones
- Experiencia de usuario optimizada

#### 7.2 Información en Tiempo Real
- Stream counts actualizados cada 5 minutos
- Balances actualizados en tiempo real
- Notificaciones de eventos importantes
- Feedback visual inmediato

### 8. SISTEMA DE ELO PARA CANCIONES

#### 8.1 Ranking de Canciones
- Cada canción tiene un ELO basado en su rendimiento
- Canciones con mejor ELO tienen ventaja en emparejamientos
- Sistema de ranking dinámico
- Actualización periódica de ELO

## TECNOLOGÍAS UTILIZADAS

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Tailwind CSS para estilos
- Viem para interacciones blockchain
- WalletConnect para conexión de wallets
- Supabase para autenticación y base de datos

### Backend
- Node.js 18+
- Express.js para API REST
- Supabase (PostgreSQL) para base de datos
- Viem para lectura de blockchain
- Servicios automatizados sin intervención manual

### Blockchain
- Base Network (Ethereum L2)
- Tokens ERC-20 (MTR, USDC)
- Smart contracts para transacciones
- Eventos blockchain para detección automática

## INNOVACIONES TÉCNICAS

1. **Detección Automática de Depósitos**: Sistema que monitorea la blockchain sin necesidad de confirmación manual
2. **Créditos Estables**: Sistema único que mantiene estabilidad independiente del precio del token
3. **Múltiples Modos de Juego**: Arquitectura flexible que soporta diferentes tipos de competencias
4. **Integración Web3 Simplificada**: Experiencia de usuario fluida para usuarios no técnicos
5. **Sistema de Vault Automático**: Gestión automática de liquidez y retiros

## CASOS DE USO

1. **Usuario Casual**: Juega en modo práctica para aprender, luego apuesta pequeñas cantidades en modo rápido
2. **Competidor Serio**: Participa en torneos, crea desafíos sociales, acumula créditos y retira ganancias
3. **Usuario Nuevo**: Compra USDC con Ramp, deposita en la plataforma, y comienza a jugar inmediatamente
4. **Comunidad**: Crea salas privadas para competir con amigos específicos

## MÉTRICAS Y ESTADÍSTICAS

- Tiempo promedio de batalla: 60 segundos
- Apuesta mínima: 5 créditos (~$5 USDC)
- Fee de plataforma: 2% por apuesta
- Actualización de streams: Cada 5 minutos
- Soporte de redes: Base Network (Chain ID 8453)

---

**Documento preparado para registro ante la DNDA**  
**Fecha:** $(Get-Date -Format "yyyy-MM-dd")
