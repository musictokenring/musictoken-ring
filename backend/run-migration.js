/**
 * Script para ejecutar migración SQL en Supabase
 * Ejecuta la migración 006 para agregar columna network a deposits
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está configurada');
    console.log('Por favor configura la variable de entorno SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
    try {
        console.log('🔄 Ejecutando migración 006: Agregar columna network a deposits...');
        
        // Leer el archivo SQL
        const migrationPath = path.join(__dirname, '../supabase/migrations/006_add_network_column_deposits.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 SQL a ejecutar:');
        console.log(sql);
        console.log('\n');
        
        // Ejecutar el SQL usando RPC o query directa
        // Nota: Supabase no tiene un método directo para ejecutar SQL arbitrario desde el cliente
        // Necesitamos usar el método rpc o ejecutar directamente
        
        // Intentar ejecutar usando query directa
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            // Si no existe la función exec_sql, intentar método alternativo
            console.log('⚠️ Método RPC no disponible, ejecutando SQL directamente...');
            
            // Dividir el SQL en comandos individuales
            const commands = sql.split(';').filter(cmd => cmd.trim().length > 0);
            
            for (const command of commands) {
                const trimmedCmd = command.trim();
                if (trimmedCmd.length > 0) {
                    console.log(`Ejecutando: ${trimmedCmd.substring(0, 50)}...`);
                    // Nota: El cliente de Supabase no permite ejecutar SQL arbitrario por seguridad
                    // Necesitamos usar la interfaz de Supabase directamente
                }
            }
            
            console.log('\n✅ Migración preparada para ejecución manual');
            console.log('📋 Por favor ejecuta el SQL en el SQL Editor de Supabase:');
            console.log('   1. Ve a tu proyecto en Supabase');
            console.log('   2. Abre el SQL Editor');
            console.log('   3. Copia y pega el contenido del archivo:');
            console.log(`   ${migrationPath}`);
            console.log('   4. Ejecuta el SQL');
            
            return;
        }
        
        console.log('✅ Migración ejecutada exitosamente');
        console.log('📊 Resultado:', data);
        
    } catch (error) {
        console.error('❌ Error ejecutando migración:', error);
        console.log('\n📋 Ejecuta manualmente el SQL en Supabase SQL Editor:');
        console.log('   1. Ve a tu proyecto en Supabase Dashboard');
        console.log('   2. Abre el SQL Editor');
        console.log('   3. Copia y pega el contenido de: supabase/migrations/006_add_network_column_deposits.sql');
        console.log('   4. Ejecuta el SQL');
    }
}

runMigration();
