const express = require('express');
const auth = require('../middleware/auth');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configuration upload
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format de fichier non supporté'));
        }
    }
});

// Récupérer profil utilisateur
router.get('/profile', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        // Récupérer informations utilisateur
        const [users] = await db.query(
            `SELECT id, nom_complet, email, telephone, solde, code_parrain, 
                    avatar, is_verified, date_inscription, derniere_connexion,
                    notifications, biometrie, langue
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        // Récupérer statistiques
        const [stats] = await db.query(
            `SELECT 
                COUNT(DISTINCT f.filleul_id) as nombre_filleuls,
                COALESCE(SUM(t.montant), 0) as total_gains,
                COALESCE(SUM(CASE WHEN t.type = 'commission' THEN t.montant ELSE 0 END), 0) as total_commissions,
                COUNT(DISTINCT up.id) as passes_actifs
             FROM users u
             LEFT JOIN filleuls f ON u.id = f.parrain_id
             LEFT JOIN transactions t ON u.id = t.user_id AND t.status = 'complete'
             LEFT JOIN user_passes up ON u.id = up.user_id AND up.statut = 'actif'
             WHERE u.id = ?`,
            [req.user.id]
        );

        // Récupérer passes actifs
        const [passes_actifs] = await db.query(
            `SELECT up.*, p.nom, p.rendement_journalier, p.badge_couleur
             FROM user_passes up
             JOIN passes p ON up.pass_id = p.id
             WHERE up.user_id = ? AND up.statut = 'actif'
             ORDER BY up.date_fin ASC`,
            [req.user.id]
        );

        res.json({
            success: true,
            user: users[0],
            stats: stats[0],
            passes_actifs
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du profil'
        });
    }
});

// Modifier profil
router.put('/profile', auth, async (req, res) => {
    const db = req.app.locals.db;
    const { nom_complet, telephone, langue, notifications } = req.body;

    try {
        const updates = [];
        const values = [];

        if (nom_complet) {
            updates.push('nom_complet = ?');
            values.push(nom_complet);
        }
        if (telephone) {
            updates.push('telephone = ?');
            values.push(telephone);
        }
        if (langue) {
            updates.push('langue = ?');
            values.push(langue);
        }
        if (notifications !== undefined) {
            updates.push('notifications = ?');
            values.push(notifications);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Aucune information à mettre à jour'
            });
        }

        values.push(req.user.id);
        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({
            success: true,
            message: 'Profil mis à jour avec succès'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du profil'
        });
    }
});

// Upload avatar
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
    const db = req.app.locals.db;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier fourni'
            });
        }

        // Traitement de l'image
        const filename = `avatar_${req.user.id}_${Date.now()}.jpg`;
        const filepath = path.join(__dirname, '../../uploads/avatars', filename);

        // Créer le dossier s'il n'existe pas
        if (!fs.existsSync(path.join(__dirname, '../../uploads/avatars'))) {
            fs.mkdirSync(path.join(__dirname, '../../uploads/avatars'), { recursive: true });
        }

        // Redimensionner et convertir l'image
        await sharp(req.file.buffer)
            .resize(300, 300)
            .jpeg({ quality: 80 })
            .toFile(filepath);

        // Ancien avatar
        const [users] = await db.query(
            'SELECT avatar FROM users WHERE id = ?',
            [req.user.id]
        );

        // Supprimer ancien avatar si différent du default
        if (users[0].avatar && users[0].avatar !== 'default-avatar.png') {
            const oldPath = path.join(__dirname, '../../uploads/avatars', users[0].avatar);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Mettre à jour en base
        await db.query(
            'UPDATE users SET avatar = ? WHERE id = ?',
            [filename, req.user.id]
        );

        res.json({
            success: true,
            message: 'Avatar mis à jour',
            avatar: filename
        });

    } catch (error) {
        console.error('Erreur upload avatar:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'upload'
        });
    }
});

// Activer 2FA
router.post('/2fa/enable', auth, async (req, res) => {
    const db = req.app.locals.db;
    const speakeasy = require('speakeasy');
    const qrcode = require('qrcode');

    try {
        const secret = speakeasy.generateSecret({
            name: `MonInvest (${req.user.email})`
        });

        // Sauvegarder le secret
        await db.query(
            'UPDATE users SET deux_facteurs_secret = ? WHERE id = ?',
            [secret.base32, req.user.id]
        );

        // Générer QR code
        const qrCode = await qrcode.toDataURL(secret.otpauth_url);

        res.json({
            success: true,
            secret: secret.base32,
            qrCode,
            message: 'Scannez le QR code avec Google Authenticator'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'activation 2FA'
        });
    }
});

// Vérifier et activer 2FA
router.post('/2fa/verify', auth, async (req, res) => {
    const db = req.app.locals.db;
    const { token } = req.body;
    const speakeasy = require('speakeasy');

    try {
        const [users] = await db.query(
            'SELECT deux_facteurs_secret FROM users WHERE id = ?',
            [req.user.id]
        );

        const verified = speakeasy.totp.verify({
            secret: users[0].deux_facteurs_secret,
            encoding: 'base32',
            token
        });

        if (verified) {
            await db.query(
                'UPDATE users SET deux_facteurs = TRUE WHERE id = ?',
                [req.user.id]
            );

            res.json({
                success: true,
                message: '2FA activé avec succès'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Code invalide'
            });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification'
        });
    }
});

// Désactiver 2FA
router.post('/2fa/disable', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        await db.query(
            'UPDATE users SET deux_facteurs = FALSE, deux_facteurs_secret = NULL WHERE id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            message: '2FA désactivé'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la désactivation'
        });
    }
});

// Historique des transactions
router.get('/transactions', auth, async (req, res) => {
    const db = req.app.locals.db;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const [transactions] = await db.query(
            `SELECT * FROM transactions 
             WHERE user_id = ? 
             ORDER BY date_transaction DESC 
             LIMIT ? OFFSET ?`,
            [req.user.id, parseInt(limit), parseInt(offset)]
        );

        const [total] = await db.query(
            'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total[0].count,
                pages: Math.ceil(total[0].count / limit)
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des transactions'
        });
    }
});

// Notifications
router.get('/notifications', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [notifications] = await db.query(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY date_creation DESC 
             LIMIT 50`,
            [req.user.id]
        );

        const [nonLues] = await db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND est_lu = FALSE',
            [req.user.id]
        );

        res.json({
            success: true,
            notifications,
            non_lues: nonLues[0].count
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des notifications'
        });
    }
});

// Marquer notification comme lue
router.put('/notifications/:id/read', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        await db.query(
            'UPDATE notifications SET est_lu = TRUE WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour'
        });
    }
});

module.exports = router;