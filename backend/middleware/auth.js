const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [users] = await req.app.locals.db.query(
            'SELECT id, nom_complet, email, role, solde FROM users WHERE id = ? AND statut = "actif"',
            [decoded.id]
        );

        if (users.length === 0) {
            throw new Error();
        }

        req.user = users[0];
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: 'Veuillez vous authentifier' 
        });
    }
};

// Middleware admin
module.exports.admin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Accès réservé aux administrateurs' 
        });
    }
    next();
};

// Middleware super admin
module.exports.superAdmin = (req, res, next) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Accès réservé au super administrateur' 
        });
    }
    next();
};