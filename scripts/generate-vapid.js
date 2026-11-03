// Génère les clés des notifications push. À copier dans le fichier .env
import webpush from 'web-push'

const cles = webpush.generateVAPIDKeys()
console.log('VAPID_PUBLIC_KEY=' + cles.publicKey)
console.log('VAPID_PRIVATE_KEY=' + cles.privateKey)
console.log('VAPID_SUBJECT=mailto:votre-adresse@exemple.fr')
