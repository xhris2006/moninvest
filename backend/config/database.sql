-- =============================================
-- BASE DE DONNÉES MON INVEST
-- =============================================

CREATE DATABASE IF NOT EXISTS moninvest_db;
USE moninvest_db;

-- =============================================
-- TABLE UTILISATEURS
-- =============================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom_complet VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    telephone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    solde DECIMAL(15,2) DEFAULT 0.00,
    code_parrain VARCHAR(20) UNIQUE,
    parrain_id INT NULL,
    avatar VARCHAR(255) DEFAULT 'default-avatar.png',
    role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_expires DATETIME,
    deux_facteurs BOOLEAN DEFAULT FALSE,
    deux_facteurs_secret VARCHAR(255),
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion TIMESTAMP NULL,
    statut ENUM('actif', 'suspendu', 'inactif') DEFAULT 'actif',
    notifications BOOLEAN DEFAULT TRUE,
    biometrie BOOLEAN DEFAULT FALSE,
    langue VARCHAR(5) DEFAULT 'fr',
    FOREIGN KEY (parrain_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================
-- TABLE PASS (ABONNEMENTS)
-- =============================================
CREATE TABLE passes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(50) NOT NULL,
    montant DECIMAL(15,2) NOT NULL,
    rendement_journalier DECIMAL(5,2) NOT NULL, -- Pourcentage
    duree_jours INT NOT NULL DEFAULT 60,
    gain_total DECIMAL(15,2) GENERATED ALWAYS AS (montant * rendement_journalier / 100 * duree_jours) STORED,
    niveau INT DEFAULT 1,
    badge_couleur VARCHAR(20),
    statut ENUM('actif', 'inactif') DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE ABONNEMENTS UTILISATEURS
-- =============================================
CREATE TABLE user_passes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    pass_id INT NOT NULL,
    montant_investi DECIMAL(15,2) NOT NULL,
    date_debut DATETIME NOT NULL,
    date_fin DATETIME NOT NULL,
    jours_restants INT GENERATED ALWAYS AS (DATEDIFF(date_fin, CURDATE())) STORED,
    gains_total DECIMAL(15,2) DEFAULT 0.00,
    dernier_gain DATE,
    statut ENUM('actif', 'expire', 'annule') DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (pass_id) REFERENCES passes(id) ON DELETE RESTRICT
);

-- =============================================
-- TABLE TRANSACTIONS
-- =============================================
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reference VARCHAR(50) UNIQUE NOT NULL,
    type ENUM('depot', 'retrait', 'gain_journalier', 'commission', 'achat_pass', 'bonus') NOT NULL,
    montant DECIMAL(15,2) NOT NULL,
    frais DECIMAL(15,2) DEFAULT 0.00,
    methode ENUM('mobile_money', 'carte_bancaire', 'virement', 'solde_interne') NOT NULL,
    operateur ENUM('mtn', 'orange', 'moov', 'wave', 'visa', 'mastercard') NULL,
    telephone VARCHAR(20) NULL,
    status ENUM('en_attente', 'complete', 'echoue', 'annule') DEFAULT 'en_attente',
    description TEXT,
    date_transaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_traitement TIMESTAMP NULL,
    admin_id INT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================
-- TABLE FILLEULS (AFFILIATION)
-- =============================================
CREATE TABLE filleuls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parrain_id INT NOT NULL,
    filleul_id INT NOT NULL,
    niveau INT DEFAULT 1, -- Niveau d'affiliation
    commission_taux DECIMAL(5,2) DEFAULT 5.00, -- Pourcentage
    commission_totale DECIMAL(15,2) DEFAULT 0.00,
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parrain_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (filleul_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_filleul (filleul_id)
);

-- =============================================
-- TABLE COMMISSIONS AFFILIATION
-- =============================================
CREATE TABLE commissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filleul_id INT NOT NULL,
    transaction_id INT NOT NULL,
    montant DECIMAL(15,2) NOT NULL,
    taux DECIMAL(5,2) NOT NULL,
    niveau INT NOT NULL,
    status ENUM('en_attente', 'paye', 'annule') DEFAULT 'en_attente',
    date_commission TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (filleul_id) REFERENCES filleuls(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- =============================================
-- TABLE RÉCLAMATIONS / SUPPORT
-- =============================================
CREATE TABLE reclamations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(20) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    sujet VARCHAR(100) NOT NULL,
    categorie ENUM('paiement', 'pass', 'bug', 'reclamation', 'information', 'partenariat', 'autre') NOT NULL,
    priorite ENUM('basse', 'moyenne', 'haute', 'urgent') DEFAULT 'moyenne',
    message TEXT NOT NULL,
    piece_jointe VARCHAR(255) NULL,
    status ENUM('en_attente', 'en_cours', 'resolu', 'ferme') DEFAULT 'en_attente',
    reponse_admin TEXT NULL,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_resolution TIMESTAMP NULL,
    admin_id INT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================
-- TABLE NOTIFICATIONS
-- =============================================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('gain', 'transaction', 'affiliation', 'systeme', 'promo') NOT NULL,
    titre VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    est_lu BOOLEAN DEFAULT FALSE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- TABLE SESSIONS
-- =============================================
CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    date_expiration DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- TABLE PARAMÈTRES SYSTÈME
-- =============================================
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cle VARCHAR(50) UNIQUE NOT NULL,
    valeur TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =============================================
-- INSERTION DES DONNÉES INITIALES
-- =============================================

-- Admin par défaut (mot de passe: Admin123!)
INSERT INTO users (nom_complet, email, telephone, password, role, is_verified, code_parrain) VALUES
('Administrateur', 'admin@moninvest.com', '+2250102030405', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'super_admin', TRUE, 'ADMIN001');

-- Insertion des passes
INSERT INTO passes (nom, montant, rendement_journalier, duree_jours, niveau, badge_couleur) VALUES
('Bronze', 4000, 10.00, 60, 1, '#CD7F32'),
('Argent', 5000, 10.00, 60, 2, '#C0C0C0'),
('Or', 7000, 10.00, 60, 3, '#FFD700'),
('Platine', 10000, 10.00, 60, 4, '#E5E4E2'),
('Diamant', 15000, 10.00, 60, 5, '#B9F2FF'),
('Elite', 20000, 10.00, 60, 6, '#8A2BE2'),
('Prestige', 25000, 10.00, 60, 7, '#FF69B4');

-- Paramètres système
INSERT INTO system_settings (cle, valeur, description) VALUES
('site_name', 'MonInvest', 'Nom du site'),
('site_url', 'https://moninvest.com', 'URL du site'),
('contact_whatsapp', '+2250708091011', 'Numéro WhatsApp'),
('contact_telegram', '@moninvest_support', 'Username Telegram'),
('contact_email', 'support@moninvest.com', 'Email support'),
('commission_parrainage', '5.00', 'Commission parrainage (%)'),
('gain_journalier', '10.00', 'Gain journalier (%)'),
('duree_pass', '60', 'Durée des passes (jours)'),
('frais_retrait', '1.00', 'Frais de retrait (%)'),
('retrait_minimum', '1000', 'Retrait minimum (FCFA)'),
('devise', 'FCFA', 'Monnaie utilisée');

-- =============================================
-- CRÉATION DES VUES
-- =============================================

-- Vue des statistiques utilisateur
CREATE VIEW user_stats AS
SELECT 
    u.id,
    u.nom_complet,
    u.solde,
    COUNT(DISTINCT f.filleul_id) as nombre_filleuls,
    COALESCE(SUM(t.montant), 0) as total_gains,
    COALESCE(SUM(CASE WHEN t.type = 'commission' THEN t.montant ELSE 0 END), 0) as total_commissions,
    COUNT(DISTINCT up.id) as passes_actifs
FROM users u
LEFT JOIN filleuls f ON u.id = f.parrain_id
LEFT JOIN transactions t ON u.id = t.user_id AND t.status = 'complete'
LEFT JOIN user_passes up ON u.id = up.user_id AND up.statut = 'actif'
GROUP BY u.id;

-- Vue des performances affiliation
CREATE VIEW affiliation_stats AS
SELECT 
    f.parrain_id,
    COUNT(f.filleul_id) as total_filleuls,
    COALESCE(SUM(c.montant), 0) as total_commissions,
    AVG(c.montant) as commission_moyenne
FROM filleuls f
LEFT JOIN commissions c ON f.id = c.filleul_id AND c.status = 'paye'
GROUP BY f.parrain_id;

-- =============================================
-- CRÉATION DES INDEX
-- =============================================

CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_telephone ON users(telephone);
CREATE INDEX idx_user_code ON users(code_parrain);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date_transaction);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_user_passes_user ON user_passes(user_id);
CREATE INDEX idx_user_passes_date ON user_passes(date_fin);
CREATE INDEX idx_reclamations_user ON reclamations(user_id);
CREATE INDEX idx_reclamations_status ON reclamations(status);
CREATE INDEX idx_filleuls_parrain ON filleuls(parrain_id);

-- =============================================
-- CRÉATION DES PROCÉDURES STOCKÉES
-- =============================================

-- Procédure de mise à jour quotidienne des gains
DELIMITER //
CREATE PROCEDURE update_daily_gains()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_user_id INT;
    DECLARE v_pass_id INT;
    DECLARE v_montant DECIMAL(15,2);
    DECLARE v_gain DECIMAL(15,2);
    DECLARE v_date_fin DATE;
    
    DECLARE cur CURSOR FOR 
        SELECT up.user_id, up.pass_id, p.montant, p.rendement_journalier, up.date_fin
        FROM user_passes up
        JOIN passes p ON up.pass_id = p.id
        WHERE up.statut = 'actif' 
        AND up.date_fin >= CURDATE()
        AND (up.dernier_gain IS NULL OR up.dernier_gain < CURDATE());
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN cur;
    
    read_loop: LOOP
        FETCH cur INTO v_user_id, v_pass_id, v_montant, v_taux, v_date_fin;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Calcul du gain
        SET v_gain = v_montant * (v_taux / 100);
        
        -- Mise à jour du solde utilisateur
        UPDATE users SET solde = solde + v_gain WHERE id = v_user_id;
        
        -- Mise à jour des gains du pass
        UPDATE user_passes 
        SET gains_total = gains_total + v_gain,
            dernier_gain = CURDATE()
        WHERE user_id = v_user_id AND pass_id = v_pass_id;
        
        -- Création de la transaction
        INSERT INTO transactions (user_id, reference, type, montant, methode, status, description)
        VALUES (
            v_user_id,
            CONCAT('GAIN', DATE_FORMAT(NOW(), '%Y%m%d'), v_user_id, v_pass_id),
            'gain_journalier',
            v_gain,
            'solde_interne',
            'complete',
            CONCAT('Gain journalier du ', DATE_FORMAT(NOW(), '%d/%m/%Y'))
        );
        
        -- Création notification
        INSERT INTO notifications (user_id, type, titre, message)
        VALUES (
            v_user_id,
            'gain',
            '💰 Gain journalier crédité',
            CONCAT('Vous avez reçu ', v_gain, ' FCFA sur votre solde.')
        );
        
    END LOOP;
    
    CLOSE cur;
    
    -- Expiration des passes
    UPDATE user_passes 
    SET statut = 'expire' 
    WHERE date_fin < CURDATE() AND statut = 'actif';
    
END//
DELIMITER ;

-- Planification du cron (tous les jours à 00:01)
CREATE EVENT IF NOT EXISTS daily_gains_event
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '00:01:00')
DO
CALL update_daily_gains();

DELIMITER //
CREATE PROCEDURE calculer_commission_parrainage(
    IN p_filleul_id INT,
    IN p_montant_achat DECIMAL(15,2)
)
BEGIN
    DECLARE v_parrain_id INT;
    DECLARE v_commission DECIMAL(15,2);
    DECLARE v_taux DECIMAL(5,2);
    
    -- Récupérer le parrain
    SELECT parrain_id INTO v_parrain_id FROM filleuls WHERE filleul_id = p_filleul_id;
    
    IF v_parrain_id IS NOT NULL THEN
        -- Récupérer le taux de commission
        SELECT valeur INTO v_taux FROM system_settings WHERE cle = 'commission_parrainage';
        SET v_commission = p_montant_achat * (v_taux / 100);
        
        -- Créditer la commission
        UPDATE users SET solde = solde + v_commission WHERE id = v_parrain_id;
        
        -- Enregistrer la commission
        INSERT INTO commissions (filleul_id, montant, taux, niveau, status)
        VALUES (
            (SELECT id FROM filleuls WHERE filleul_id = p_filleul_id),
            v_commission,
            v_taux,
            1,
            'paye'
        );
        
        -- Créer la transaction
        INSERT INTO transactions (user_id, reference, type, montant, methode, status, description)
        VALUES (
            v_parrain_id,
            CONCAT('COMM', DATE_FORMAT(NOW(), '%Y%m%d'), v_parrain_id),
            'commission',
            v_commission,
            'solde_interne',
            'complete',
            CONCAT('Commission parrainage - Achat de ', p_montant_achat, ' FCFA')
        );
        
        -- Notification
        INSERT INTO notifications (user_id, type, titre, message)
        VALUES (
            v_parrain_id,
            'affiliation',
            '👥 Nouvelle commission',
            CONCAT('Vous avez reçu ', v_commission, ' FCFA de commission')
        );
    END IF;
END//
DELIMITER ;