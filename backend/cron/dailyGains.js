const cron = require('node-cron');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Planification quotidienne à 00:01
cron.schedule('1 0 * * *', async () => {
    console.log('🚀 Début de la mise à jour quotidienne des gains...');
    console.log(`📅 ${new Date().toLocaleString()}`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // Appeler la procédure stockée
        await connection.execute('CALL update_daily_gains()');

        console.log('✅ Mise à jour des gains terminée avec succès');

        // Log de l'exécution
        await connection.execute(
            `INSERT INTO system_logs (type, message, date_execution) 
             VALUES ('cron', 'Mise à jour quotidienne des gains effectuée', NOW())`
        );

    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour des gains:', error);
        
        if (connection) {
            await connection.execute(
                `INSERT INTO system_logs (type, message, error, date_execution) 
                 VALUES ('cron_error', 'Erreur mise à jour des gains', ?, NOW())`,
                [error.message]
            );
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}, {
    scheduled: true,
    timezone: "Africa/Abidjan"
});

console.log('⏰ Cron job planifié pour 00:01 chaque jour');

// Vérification des passes expirés toutes les heures
cron.schedule('0 * * * *', async () => {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // Mettre à jour les passes expirés
        const [result] = await connection.execute(
            `UPDATE user_passes 
             SET statut = 'expire' 
             WHERE date_fin < CURDATE() AND statut = 'actif'`
        );

        if (result.affectedRows > 0) {
            console.log(`✅ ${result.affectedRows} passes expirés mis à jour`);
        }

    } catch (error) {
        console.error('❌ Erreur vérification passes expirés:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}, {
    scheduled: true,
    timezone: "Africa/Abidjan"
});

module.exports = cron;