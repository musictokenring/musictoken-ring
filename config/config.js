// Configuración de la aplicación MusicToken Ring
const CONFIG = {
    // Backend API URL
    BACKEND_API: 'http://localhost:3000',  // CAMBIAR EN PRODUCCIÓN
    
    // Blockchain Configuration
    CHAIN_ID: 8453,  // Base Mainnet
    RPC_URL: 'https://mainnet.base.org',
    
    // Smart Contracts (actualizar después del deploy)
    CONTRACT_ADDRESS: '0xYourBattleContractAddress',
    TOKEN_ADDRESS: '0x99cd1eb32846c9027ed9cb88710066fa08791c33b',
    
    // App Configuration
    BATTLE_DURATION: 60,  // segundos
    BURN_RATE: 0.005,     // 0.5%
    MAX_BET: 10000,       // MTR
}
