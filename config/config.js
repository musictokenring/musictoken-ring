// Configuración de la aplicación MusicToken Ring
const CONFIG = {
    // Backend API URL
    BACKEND_API: 'http://localhost:3000',  // CAMBIAR EN PRODUCCIÓN
    
    // Blockchain Configuration
    CHAIN_ID: 80001,  // Mumbai testnet (cambiar a 137 para Polygon mainnet)
    RPC_URL: 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_ALCHEMY_KEY',
    
    // Smart Contracts (actualizar después del deploy)
    CONTRACT_ADDRESS: '0xYourBattleContractAddress',
    TOKEN_ADDRESS: '0xYourTokenContractAddress',
    
    // App Configuration
    BATTLE_DURATION: 60,  // segundos
    BURN_RATE: 0.005,     // 0.5%
    MAX_BET: 10000,       // $MTOKEN
}
