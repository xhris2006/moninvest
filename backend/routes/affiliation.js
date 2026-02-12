const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

// Statistiques affiliation
router.get('/stats', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        // Nombre de filleuls
        const [filleuls] = await db.query(
            'SELECT COUNT(*) as total FROM filleuls WHERE parrain_id = ?',
            [req.user.id]
        );

        // Commissions totales
        const [commissions] = await db.query(
            `SELECT COALESCE(SUM(c.montant), 0) as total
             FROM commissions c
             JOIN filleuls f ON c.filleul_id = f.id
             WHERE f.parrain_id = ? AND c.status = 'paye'`,
            [req.user.id]
        );

        // Clics sur le lien (à implémenter avec une table de tracking)
        const clics = 156; // Valeur simulée

        // Top filleuls
        const [topFilleuls] = await db.query(
            `SELECT u.nom_complet, u.avatar, c.montant, c.date_commission
             FROM commissions c
             JOIN filleuls f ON c.filleul_id = f.id
             JOIN users u ON f.filleul_id = u.id
             WHERE f.parrain_id = ? AND c.status = 'paye'
             ORDER BY c.montant DESC
             LIMIT 5`,
            [req.user.id]
        );

        res.json({
            success: true,
            stats: {
                filleuls: filleuls[0].total,
                commissions: commissions[0].total,
                clics
            },
            top_filleuls: topFilleuls
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques'
        });
    }
});

// Liste des filleuls
router.get('/filleuls', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [filleuls] = await db.query(
            `SELECT 
                u.id, u.nom_complet, u.email, u.avatar, u.date_inscription,
                COALESCE(SUM(c.montant), 0) as commissions_total,
                COUNT(DISTINCT up.id) as passes_actifs
             FROM filleuls f
             JOIN users u ON f.filleul_id = u.id
             LEFT JOIN commissions c ON f.id = c.filleul_id AND c.status = 'paye'
             LEFT JOIN user_passes up ON u.id = up.user_id AND up.statut = 'actif'
             WHERE f.parrain_id = ?
             GROUP BY u.id
             ORDER BY u.date_inscription DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            filleuls
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des filleuls'
        });
    }
});

// Historique des commissions
router.get('/commissions', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [commissions] = await db.query(
            `SELECT c.*, u.nom_complet as filleul_nom
             FROM commissions c
             JOIN filleuls f ON c.filleul_id = f.id
             JOIN users u ON f.filleul_id = u.id
             WHERE f.parrain_id = ?
             ORDER BY c.date_commission DESC
             LIMIT 50`,
            [req.user.id]
        );

        res.json({
            success: true,
            commissions
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des commissions'
        });
    }
});

// Générer QR code
router.get('/qrcode', auth, async (req, res) => {
    const db = req.app.locals.db;
    const QRCode = require('qrcode');

    try {
        const [users] = await db.query(
            'SELECT code_parrain FROM users WHERE id = ?',
            [req.user.id]
        );

        const lien = `${process.env.SITE_URL}/register?ref=${users[0].code_parrain}`;
        const qrCode = await QRCode.toDataURL(lien);

        res.json({
            success: true,
            qr_code: qrCode,
            lien
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération du QR code'
        });
    }
});

module.exports = router;