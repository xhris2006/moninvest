const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

// Récupérer tous les passes disponibles
router.get('/', async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [passes] = await db.query(
            'SELECT * FROM passes WHERE statut = "actif" ORDER BY montant ASC'
        );

        res.json({
            success: true,
            passes
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des passes'
        });
    }
});

// Récupérer les passes actifs de l'utilisateur
router.get('/actifs', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [passes] = await db.query(
            `SELECT up.*, p.nom, p.montant, p.rendement_journalier, p.badge_couleur,
                    DATEDIFF(up.date_fin, CURDATE()) as jours_restants
             FROM user_passes up
             JOIN passes p ON up.pass_id = p.id
             WHERE up.user_id = ? AND up.statut = 'actif'
             ORDER BY up.date_fin ASC`,
            [req.user.id]
        );

        res.json({
            success: true,
            passes
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des passes actifs'
        });
    }
});

// Récupérer l'historique des passes
router.get('/historique', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [passes] = await db.query(
            `SELECT up.*, p.nom, p.montant
             FROM user_passes up
             JOIN passes p ON up.pass_id = p.id
             WHERE up.user_id = ? AND up.statut != 'actif'
             ORDER BY up.date_fin DESC
             LIMIT 20`,
            [req.user.id]
        );

        res.json({
            success: true,
            passes
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération de l\'historique'
        });
    }
});

// Détails d'un pass
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [passes] = await db.query(
            'SELECT * FROM passes WHERE id = ?',
            [req.params.id]
        );

        if (passes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pass non trouvé'
            });
        }

        res.json({
            success: true,
            pass: passes[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du pass'
        });
    }
});

// Calculateur de gains
router.post('/calculer', async (req, res) => {
    const { montant, duree = 60, rendement = 10 } = req.body;

    try {
        const gain_journalier = montant * (rendement / 100);
        const gain_total = gain_journalier * duree;
        const benefice_net = gain_total - montant;
        const roi = (benefice_net / montant) * 100;

        res.json({
            success: true,
            calcul: {
                montant_investi: montant,
                rendement_journalier: `${rendement}%`,
                gain_journalier,
                duree_jours: duree,
                gain_total,
                benefice_net,
                roi: `${roi.toFixed(2)}%`
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du calcul'
        });
    }
});

module.exports = router;s