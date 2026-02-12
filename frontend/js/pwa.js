// Vérifier le support PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker enregistré:', registration.scope);
                
                // Vérifier les mises à jour
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nouvelle version détectée');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Erreur Service Worker:', error);
            });
    });
}

// Demander l'autorisation de notifications push
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('Notifications non supportées');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    return false;
}

// S'abonner aux notifications push
async function subscribeToPushNotifications() {
    try {
        const permission = await requestNotificationPermission();
        if (!permission) {
            console.log('Permission notifications refusée');
            return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        
        // Vérifier l'abonnement existant
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            // Clé publique VAPID à générer
            const vapidPublicKey = 'BBBBBvL8RvL_Jc-VFIlS4wJqRijKJ5qXjYy5JXZqQwQTxJc8Q2cQ3QwQTxJc8Q2cQ3QwQTxJc8Q2cQ3QwQTxJc8Q2cQ3Q';
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
            
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
            
            // Envoyer l'abonnement au serveur
            await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
        }
        
        return subscription;
    } catch (error) {
        console.error('Erreur subscription push:', error);
    }
}

// Convertir base64 en Uint8Array (pour VAPID)
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Afficher notification de mise à jour
function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 16px;
        right: 16px;
        background: var(--primary);
        color: white;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 9999;
        animation: slideUp 0.3s ease;
    `;
    
    updateBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas fa-sync-alt" style="font-size: 20px;"></i>
            <span>Nouvelle version disponible</span>
        </div>
        <button onclick="location.reload()" style="background: white; color: var(--primary); border: none; padding: 8px 16px; border-radius: 20px; font-weight: 600; cursor: pointer;">
            Mettre à jour
        </button>
    `;
    
    document.body.appendChild(updateBanner);
    
    // Ajouter animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// Vérifier la connectivité
function checkConnectivity() {
    if (!navigator.onLine) {
        showOfflineNotification();
    }
    
    window.addEventListener('online', () => {
        hideOfflineNotification();
        syncOfflineData();
    });
    
    window.addEventListener('offline', () => {
        showOfflineNotification();
    });
}

// Afficher notification hors ligne
function showOfflineNotification() {
    let offlineBanner = document.getElementById('offline-banner');
    if (!offlineBanner) {
        offlineBanner = document.createElement('div');
        offlineBanner.id = 'offline-banner';
        offlineBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: var(--danger);
            color: white;
            padding: 12px;
            text-align: center;
            font-size: 14px;
            z-index: 9999;
        `;
        offlineBanner.innerHTML = `
            <i class="fas fa-wifi-slash"></i>
            Mode hors ligne - Certaines fonctionnalités sont limitées
        `;
        document.body.prepend(offlineBanner);
    }
}

// Cacher notification hors ligne
function hideOfflineNotification() {
    const offlineBanner = document.getElementById('offline-banner');
    if (offlineBanner) {
        offlineBanner.remove();
    }
}

// Synchroniser les données hors ligne
async function syncOfflineData() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-transactions');
        await registration.sync.register('sync-reclamations');
    }
}

// Initialiser PWA
document.addEventListener('DOMContentLoaded', () => {
    checkConnectivity();
    
    // Demander les notifications après connexion
    const token = localStorage.getItem('token');
    if (token) {
        subscribeToPushNotifications();
    }
});

// Ajouter au bureau
function addToHomeScreen() {
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Afficher le bouton d'installation
        showInstallButton();
    });
    
    async function showInstallButton() {
        const installButton = document.createElement('button');
        installButton.id = 'install-button';
        installButton.className = 'btn btn-primary';
        installButton.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 16px;
            right: 16px;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        `;
        installButton.innerHTML = `
            <i class="fas fa-download"></i>
            Installer l'application
        `;
        
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('✅ Application installée');
            }
            
            deferredPrompt = null;
            installButton.remove();
        });
        
        document.body.appendChild(installButton);
    }
}

// Gestion du mode hors ligne pour les formulaires
class OfflineFormHandler {
    constructor(formId, storageKey) {
        this.form = document.getElementById(formId);
        this.storageKey = storageKey;
        this.init();
    }
    
    init() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());
        
        if (navigator.onLine) {
            // En ligne - soumettre normalement
            try {
                const response = await fetch(this.form.action, {
                    method: this.form.method,
                    body: formData
                });
                
                if (response.ok) {
                    this.showSuccess('Envoyé avec succès');
                    this.form.reset();
                }
            } catch (error) {
                this.saveOffline(data);
            }
        } else {
            // Hors ligne - sauvegarder
            this.saveOffline(data);
        }
    }
    
    saveOffline(data) {
        const offlineData = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        offlineData.push({
            id: Date.now(),
            data: data,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(this.storageKey, JSON.stringify(offlineData));
        
        this.showSuccess('Sauvegardé en local - sera synchronisé plus tard');
    }
    
    showSuccess(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 16px;
            right: 16px;
            background: var(--success);
            color: white;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            animation: slideUp 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }
}

// Initialiser gestionnaires hors ligne
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('reclamationForm')) {
        new OfflineFormHandler('reclamationForm', 'offline-reclamations');
    }
});

// Exporter les fonctions
window.pwa = {
    subscribeToPushNotifications,
    addToHomeScreen,
    checkConnectivity,
    OfflineFormHandler
};