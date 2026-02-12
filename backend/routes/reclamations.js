const express = require('express');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configuration upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/reclamations';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'reclam-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format de fichier non supporté'));
        }
    }
});

// Créer une réclamation
router.post('/', auth, upload.single('piece_jointe'), async (req, res) => {
    const db = req.app.locals.db;
    const { sujet, categorie, priorite, message } = req.body;

    try {
        // Générer référence unique
        const reference = `RECL${Date.now()}${req.user.id}`;

        const [result] = await db.query(
            `INSERT INTO reclamations 
             (reference, user_id, sujet, categorie, priorite, message, piece_jointe) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                reference,
                req.user.id,
                sujet,
                categorie,
                priorite || 'moyenne',
                message,
                req.file ? req.file.filename : null
            ]
        );

        // Notification admin
        await db.query(
            `INSERT INTO notifications (user_id, type, titre, message) 
             SELECT id, 'systeme', '📩 Nouvelle réclamation', 
             CONCAT('Réclamation ', ?, ' de ', ?)
             FROM users WHERE role IN ('admin', 'super_admin')`,
            [reference, req.user.nom_complet]
        );

        res.json({
            success: true,
            message: 'Réclamation envoyée avec succès',
            reference
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'envoi de la réclamation'
        });
    }
});

// Lister mes réclamations
router.get('/', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [reclamations] = await db.query(
            `SELECT * FROM reclamations 
             WHERE user_id = ? 
             ORDER BY date_creation DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            reclamations
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des réclamations'
        });
    }
});

// Détails d'une réclamation
router.get('/:id', auth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [reclamations] = await db.query(
            `SELECT * FROM reclamations 
             WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );

        if (reclamations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Réclamation non trouvée'
            });
        }

        res.json({
            success: true,
            reclamation: reclamations[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération de la réclamation'
        });
    }
});

module.exports = router;