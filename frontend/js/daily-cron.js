// daily-cron.js - À exécuter tous les jours à 00:01
// Simule la mise à jour automatique des soldes

const DAILY_GAIN_PERCENTAGE = 0.10; // 10% par jour

class DailyGainUpdater {
    constructor() {
        this.utilisateurs = [
            {
                id: 1,
                nom: "Jean Dupont",
                solde: 45800,
                pass_actifs: [
                    { type: "Bronze", montant: 4000, date_debut: "2025-02-01", date_fin: "2025-04-01", jours_restants: 58 },
                    { type: "Or", montant: 7000, date_debut: "2025-02-05", date_fin: "2025-04-05", jours_restants: 45 },
                    { type: "Diamant", montant: 15000, date_debut: "2025-02-10", date_fin: "2025-04-10", jours_restants: 60 }
                ]
            }
        ];
    }

    // Mise à jour quotidienne des gains
    updateDailyGains() {
        console.log(`🕛 Début de la mise à jour quotidienne: ${new Date().toLocaleString()}`);
        
        this.utilisateurs.forEach(utilisateur => {
            let gains_aujourd_hui = 0;
            
            utilisateur.pass_actifs.forEach(pass => {
                // Vérifier si le pass est toujours actif
                const date_fin = new Date(pass.date_fin);
                const aujourd_hui = new Date();
                
                if (date_fin >= aujourd_hui) {
                    // Calcul du gain journalier (10% du montant)
                    const gain = pass.montant * DAILY_GAIN_PERCENTAGE;
                    gains_aujourd_hui += gain;
                    
                    // Mise à jour du nombre de jours restants
                    pass.jours_restants--;
                    
                    console.log(`✅ Pass ${pass.type} - Gain: ${gain} FCFA - Jours restants: ${pass.jours_restants}`);
                }
            });

            // Mise à jour du solde
            if (gains_aujourd_hui > 0) {
                utilisateur.solde += gains_aujourd_hui;
                
                // Création de la transaction
                this.creerTransaction(utilisateur.id, gains_aujourd_hui);
                
                console.log(`💰 ${utilisateur.nom}: +${gains_aujourd_hui} FCFA (Nouveau solde: ${utilisateur.solde} FCFA)`);
            }
        });

        console.log(`✅ Mise à jour terminée à ${new Date().toLocaleString()}`);
        
        // Envoyer notifications push
        this.envoyerNotifications();
    }

    // Créer une transaction
    creerTransaction(userId, montant) {
        const transaction = {
            id: Date.now(),
            user_id: userId,
            type: "Gain journalier",
            montant: montant,
            date: new Date().toISOString(),
            statut: "complété",
            description: "Crédit automatique quotidien"
        };
        
        console.log(`📝 Transaction créée:`, transaction);
        return transaction;
    }

    // Simuler l'envoi de notifications
    envoyerNotifications() {
        console.log("🔔 Notifications push envoyées aux utilisateurs");
    }

    // Vérifier les pass expirés
    checkExpiredPasses() {
        this.utilisateurs.forEach(utilisateur => {
            utilisateur.pass_actifs = utilisateur.pass_actifs.filter(pass => {
                const date_fin = new Date(pass.date_fin);
                const aujourd_hui = new Date();
                
                if (date_fin < aujourd_hui) {
                    console.log(`⚠️ Pass ${pass.type} expiré pour ${utilisateur.nom}`);
                    return false;
                }
                return true;
            });
        });
    }
}

// Exécution quotidienne
const updater = new DailyGainUpdater();

// Simuler l'exécution du cron job
function runDailyUpdate() {
    console.log("=".repeat(50));
    console.log("🚀 CRON JOB: Mise à jour quotidienne des gains");
    console.log("=".repeat(50));
    
    updater.checkExpiredPasses();
    updater.updateDailyGains();
    
    console.log("=".repeat(50));
}

// Exécuter
runDailyUpdate();

// Export pour utilisation avec Node-cron
// module.exports = { runDailyUpdate };