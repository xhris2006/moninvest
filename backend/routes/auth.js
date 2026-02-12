const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const router = express.Router();

// Inscription
router.post('/register', [
    body('nom_complet').notEmpty().withMessage('Nom complet requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('telephone').notEmpty().withMessage('Téléphone requis'),
    body('password').isLength({ min: 6 }).withMessage('Mot de passe trop court (min 6)'),
    body('code_parrain').optional()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            errors: errors.array() 
        });
    }

    const db = req.app.locals.db;
    const { nom_complet, email, telephone, password, code_parrain } = req.body;

    try {
        // Vérifier si l'utilisateur existe déjà
        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ? OR telephone = ?',
            [email, telephone]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cet email ou téléphone est déjà utilisé' 
            });
        }

        // Hash du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Générer code parrain unique
        const code = nom_complet.substring(0, 3).toUpperCase() + 
                    Math.random().toString(36).substring(2, 8).toUpperCase();

        // Vérifier le code parrain si fourni
        let parrain_id = null;
        if (code_parrain) {
            const [parrain] = await db.query(
                'SELECT id FROM users WHERE code_parrain = ?',
                [code_parrain]
            );
            if (parrain.length > 0) {
                parrain_id = parrain[0].id;
            }
        }

        // Générer token de vérification
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Insérer l'utilisateur
        const [result] = await db.query(
            `INSERT INTO users (nom_complet, email, telephone, password, code_parrain, parrain_id, verification_token) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nom_complet, email, telephone, hashedPassword, code, parrain_id, verificationToken]
        );

        // Si parrain, créer la relation filleul
        if (parrain_id) {
            await db.query(
                'INSERT INTO filleuls (parrain_id, filleul_id) VALUES (?, ?)',
                [parrain_id, result.insertId]
            );
        }

        // Créer notification de bienvenue
        await db.query(
            `INSERT INTO notifications (user_id, type, titre, message) 
             VALUES (?, 'systeme', '🎉 Bienvenue sur Mon Invest', 'Merci de votre inscription. Commencez à investir dès maintenant !')`,
            [result.insertId]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Inscription réussie. Veuillez vérifier votre email.',
            verification_token: verificationToken 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de l\'inscription' 
        });
    }
});

// Connexion
router.post('/login', [
    body('email').isEmail().withMessage('Email invalide'),
    body('password').notEmpty().withMessage('Mot de passe requis')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            errors: errors.array() 
        });
    }

    const db = req.app.locals.db;
    const { email, password } = req.body;

    try {
        // Rechercher l'utilisateur
        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou mot de passe incorrect' 
            });
        }

        const user = users[0];

        // Vérifier le statut
        if (user.statut !== 'actif') {
            return res.status(403).json({ 
                success: false, 
                message: 'Votre compte est suspendu. Contactez le support.' 
            });
        }

        // Vérifier le mot de passe
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou mot de passe incorrect' 
            });
        }

        // Vérifier 2FA si activé
        if (user.deux_facteurs) {
            return res.json({
                success: true,
                deux_facteurs: true,
                user_id: user.id
            });
        }

        // Générer token JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        // Mettre à jour dernière connexion
        await db.query(
            'UPDATE users SET derniere_connexion = NOW() WHERE id = ?',
            [user.id]
        );

        // Enregistrer la session
        await db.query(
            `INSERT INTO sessions (user_id, token, ip_address, user_agent, date_expiration) 
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
            [user.id, token, req.ip, req.headers['user-agent']]
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                nom_complet: user.nom_complet,
                email: user.email,
                telephone: user.telephone,
                solde: user.solde,
                role: user.role,
                code_parrain: user.code_parrain,
                avatar: user.avatar,
                deux_facteurs: user.deux_facteurs
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la connexion' 
        });
    }
});

// Vérification 2FA
router.post('/verify-2fa', async (req, res) => {
    const { user_id, token_2fa } = req.body;
    const db = req.app.locals.db;

    try {
        const [users] = await db.query(
            'SELECT * FROM users WHERE id = ?',
            [user_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Utilisateur non trouvé' 
            });
        }

        const user = users[0];

        // Vérifier le token 2FA
        const verified = speakeasy.totp.verify({
            secret: user.deux_facteurs_secret,
            encoding: 'base32',
            token: token_2fa
        });

        if (!verified) {
            return res.status(401).json({ 
                success: false, 
                message: 'Code 2FA invalide' 
            });
        }

        // Générer token JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        res.json({ success: true, token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la vérification 2FA' 
        });
    }
});

// Vérification email
router.get('/verify-email/:token', async (req, res) => {
    const db = req.app.locals.db;
    const { token } = req.params;

    try {
        const [users] = await db.query(
            'SELECT id FROM users WHERE verification_token = ?',
            [token]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Token de vérification invalide' 
            });
        }

        await db.query(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
            [users[0].id]
        );

        res.json({ 
            success: true, 
            message: 'Email vérifié avec succès' 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la vérification' 
        });
    }
});

// Mot de passe oublié
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Email invalide')
], async (req, res) => {
    const db = req.app.locals.db;
    const { email } = req.body;

    try {
        const [users] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Aucun compte associé à cet email' 
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        
        await db.query(
            `UPDATE users 
             SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) 
             WHERE id = ?`,
            [resetToken, users[0].id]
        );

        // Envoyer email avec resetToken (à implémenter)

        res.json({ 
            success: true, 
            message: 'Instructions de réinitialisation envoyées par email' 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la demande' 
        });
    }
});

// Réinitialiser mot de passe
router.post('/reset-password/:token', [
    body('password').isLength({ min: 6 }).withMessage('Mot de passe trop court')
], async (req, res) => {
    const db = req.app.locals.db;
    const { token } = req.params;
    const { password } = req.body;

    try {
        const [users] = await db.query(
            'SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token invalide ou expiré' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
            [hashedPassword, users[0].id]
        );

        res.json({ 
            success: true, 
            message: 'Mot de passe réinitialisé avec succès' 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la réinitialisation' 
        });
    }
});

// Déconnexion
router.post('/logout', require('../middleware/auth'), async (req, res) => {
    const db = req.app.locals.db;

    try {
        await db.query(
            'DELETE FROM sessions WHERE token = ?',
            [req.token]
        );

        res.json({ 
            success: true, 
            message: 'Déconnexion réussie' 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la déconnexion' 
        });
    }
});

module.exports = router;