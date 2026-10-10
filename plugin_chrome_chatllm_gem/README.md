# ChatLLM Exporter (Copilot, Gemini, Claude) `v2.3.0`

Extension Chrome (Manifest V3) permettant d'extraire et d'exporter l'intégralité d'une conversation depuis **Microsoft Copilot**, **Google Gemini** et **Anthropic Claude**, y compris les conversations très longues et l'ensemble des images (envoyées par vous ou générées par l'IA).

---

## 🚀 Fonctionnalités Clés

- **Défilement automatique & Récolte incrémentale (*Scroll & Harvest*)** :
  - Conçu spécialement pour contourner les mécanismes de **chargement progressif (infinite scroll)** et de **virtualisation DOM** (où les messages hors de l'écran sont temporairement détruits par le site web).
  - Parcourt l'historique du début à la fin pour capturer chaque message et chaque image dans l'ordre chronologique exact.
  - Bouton *"Arrêter et exporter maintenant"* disponible à tout moment si vous souhaitez interrompre le défilement et sauvegarder immédiatement.
- **Support complet des images** :
  - Extrait les images **envoyées par l'utilisateur** (photos, captures d'écran, documents visuels).
  - Extrait les images **générées par l'IA** (DALL-E 3 / Designer sur Copilot, Imagen sur Gemini, artefacts graphiques sur Claude).
  - Convertit automatiquement les images distantes ou blobs en Base64 via Canvas et relais Service Worker (contournement des restrictions CORS).
- **Formats d'exportation disponibles** :
  1. **Markdown autonome (.md)** : Un fichier Markdown unique avec toutes les images directement intégrées en Base64 (idéal pour Obsidian, Notion, VS Code, ou partage immédiat).
  2. **Markdown + Images (.zip)** : Une archive compressée contenant `conversation.md` avec des liens relatifs vers un sous-dossier `images/` contenant les fichiers originaux (.png, .jpg, .webp).
  3. **Document PDF (.pdf)** : Une mise en page soignée (bulles de messages distinctes, thèmes clairs, avatars, blocs de code préservés, sauts de page intelligents) prête à être imprimée ou enregistrée en PDF vectoriel haute définition via le moteur natif de Chrome.
  4. **Texte brut (.txt)** : Format texte pur délimité et horodaté.
- **Interface In-Page élégante et discrète** :
  - Bouton flottant bleu en bas à droite de votre écran sur les sites supportés.
  - Fenêtre contextuelle affichant la progression en temps réel (nombre de messages détectés, étapes de défilement, traitement des images).
  - Icône dans la barre d'outils Chrome pour un accès rapide.

---

## 📦 Installation dans Google Chrome

1. Ouvrez **Google Chrome**.
2. Dans la barre d'adresse, accédez à : `chrome://extensions/`
3. En haut à droite, activez l'interrupteur **« Mode développeur »**.
4. En haut à gauche, cliquez sur le bouton **« Charger le dossier non empaqueté »** (ou *Load unpacked*).
5. Sélectionnez le dossier contenant l'extension :
   ```
   f:\plugin_chrome_chatllm
   ```
6. L'extension **ChatLLM Exporter** apparaît instantanément dans votre liste d'extensions !

---

## 💡 Mode d'emploi

1. Rendez-vous sur l'un des chats supportés :
   - **Claude** : [https://claude.ai](https://claude.ai)
   - **Google Gemini** : [https://gemini.google.com](https://gemini.google.com)
   - **Microsoft Copilot** : [https://copilot.com](https://copilot.com) ou [https://copilot.microsoft.com](https://copilot.microsoft.com)
2. Ouvrez une conversation (courte ou très longue).
3. Cliquez sur le **bouton flottant bleu** en bas à droite de la page (ou cliquez sur l'icône de l'extension dans votre barre d'outils Chrome).
4. Choisissez vos options :
   - **Format d'export** : Markdown autonome (.md), Archive ZIP (.zip), Document PDF (.pdf), ou Texte brut (.txt).
   - **Mode de défilement** : 
     - *Défilement automatique complet* (recommandé pour les longues conversations avec chargement progressif).
     - *Capture rapide* (messages actuellement affichés à l'écran).
   - **Extraire les images** : cochez pour inclure toutes les images envoyées et générées.
5. Cliquez sur **« Démarrer l'extraction »**.
6. L'extension fait défiler automatiquement la conversation, charge l'historique, capture chaque message, traite les images et déclenche le téléchargement de votre fichier final !

---

## 🛠️ Structure du Projet

```
plugin_chrome_chatllm/
├── manifest.json              # Déclaration Manifest V3 & permissions
├── README.md                  # Documentation du projet
├── icons/                     # Icônes de l'extension (16x16, 48x48, 128x128)
├── background/
│   └── service_worker.js      # Relais de téléchargement et contournement CORS d'images
├── content/
│   ├── overlay.css            # Styles du bouton flottant et du panneau
│   ├── overlay.js             # Contrôleur d'interface et orchestration de l'export
│   ├── scroller.js            # Algorithme Scroll & Harvest pour les chats longs
│   ├── image_processor.js     # Détection et conversion Base64/Canvas des images
│   ├── content_main.js        # Détection de plateforme (Claude, Gemini, Copilot)
│   ├── parsers/
│   │   ├── base_parser.js     # Moteur DOM -> Markdown et déduplication stable
│   │   ├── claude_parser.js   # Sélecteurs spécifiques pour Claude.ai
│   │   ├── gemini_parser.js   # Sélecteurs spécifiques pour Google Gemini
│   │   └── copilot_parser.js  # Sélecteurs spécifiques pour Microsoft Copilot
│   └── formatters/
│       ├── txt_formatter.js   # Générateur .txt
│       ├── md_formatter.js    # Générateur .md et .zip
│       └── pdf_formatter.js   # Gabarit d'impression haute fidélité PDF
├── lib/
│   └── zip_util.js            # Générateur d'archives ZIP autonome (sans dépendances)
└── popup/
    ├── popup.html             # Interface d'état de l'icône Chrome
    ├── popup.css              # Styles de la popup
    └── popup.js               # Interaction avec l'onglet actif
```

---

## 📝 Historique des versions

### v1.5.3 (Actuelle)
- **Nouvelle interface Copilot prise en charge !** L'extension gère désormais la toute nouvelle façon dont Copilot affiche les images (bouton "X images" qui s'ouvre directement dans la page au lieu d'une fenêtre par-dessus). 
- Sécurité renforcée pour éviter le double-clic lors de l'ouverture des galeries.

### v1.5.2

### v1.4.9

### v1.4.8

### v1.4.7

### v1.4.6
- **Sécurité :** Retrait de la tentative d'expansion automatique des images multiples sur Copilot, car cela cliquait accidentellement sur des liens publicitaires/shopping générés par l'IA et perturbait l'extraction.
- **Correction :** Disparition de l'erreur rouge "Message length exceeded" dans la console lors du déclenchement légitime de la sécurité de repli HTML pour les gros exports PDF.

### v1.4.5
- **Correction :** Les images encodées en `data:application/octet-stream` par Copilot sont maintenant converties en `image/png` pour corriger l'affichage "texte brut" des images (chaîne Base64) dans le PDF et le Markdown.
- **Correction :** Élimination des images en doublon à la fin des exports (résolution d'un problème de détection des images déjà placées dans le texte).

### v1.3.1
- **Résolution de la duplication et perte d'images Bing / DALL-E :** Préservation de l'identifiant canonique d'image (`?id=OIG...`) évitant la collision d'URLs lors de la conversion et du cache.
- **Nettoyage des artefacts de génération d'image Designer :** Suppression des répétitions de prompts (`# genere moi une image...`) et métadonnées d'interface dans le texte exporté.
- **Suppression des favicons et vignettes de recherche :** Exclusion stricte des blocs de sources Bing/Google (`services.bingapis.com/favicon`).
- **Attribution précise des rôles :** Détection stricte des messages utilisateur vs Copilot sans faux-positifs.
- **Synchronisation visuelle des versions :** Affichage automatique du numéro de version dans le panneau d'export et le popup.

### v1.3.0
- Système de défilement incrémental *Scroll & Harvest*.
- Support multi-formats : Markdown autonome (Base64), Markdown + Images (ZIP), PDF vectoriel et TXT.
- Support de Microsoft Copilot, Google Gemini et Anthropic Claude.

### v1.3.2
- Filtre strict contre les encarts de feedback "BizChat" et les artefacts "favicon type".

### v1.3.3
- Suppression ultime par regex en fin de chaine des artefacts persistants ('You said', 'Sources', 'Favicon type').

### v1.3.4
- Correction de l'erreur \chrome.storage.local\ (TypeError reading 'local') lors de l'export PDF en d?l?guant le stockage au service worker.

### v1.3.5
- Autorisation de l'affichage des images distantes dans la page d'impression PDF (assouplissement du Content Security Policy).

### v1.3.6
- Ajout de la permission \unlimitedStorage\ pour autoriser l'export PDF des conversations contenant de nombreuses images.

### v1.3.7
- Correction d'une erreur \Invalid regular expression: Regular expression too large\ lors de la g?n?ration du Markdown avec de lourdes images Base64 en rempla?ant l'utilisation d'expressions r?gulires dynamiques par un remplacement de chane simple.

### v1.3.8
- Correction d'un d?faut entraknant la duplication massive des messages Copilot du au compteur de rendu React (\data-test-render-count\).
- Augmentation du temps de pause lors du d?filement (scroller) pour laisser le temps aux images (lazy-loading) de charger compltement.

### v1.3.9
- Correction de l'export PDF o certaines images apparaissaient sous forme de texte brut suite  une regex de formatage trop restrictive.
- Augmentation significative de la tol?rance d'attente lors du d?filement pour ?viter de manquer le d?but de la conversation lorsque Copilot met beaucoup de temps  charger son historique.

### v1.4.0
- R?solution du problme d'image dupliqu?e (basse d?finition vs haute d?finition) dans le mGme message Markdown grce  la synchronisation pr?cise de l'attribut \currentSrc\ lors du clonage du DOM.
- Les noms de fichiers g?n?r?s incluent d?sormais un horodatage lisible (ex: \_2026-09-27_12-00-00\) au lieu d'un num?ro UNIX abstrait pour faciliter le tri et le d?bogage.

### v1.4.4
- Ajout du support pour le nouveau domaine Microsoft `copilot.cloud.microsoft`.

### v1.4.3
- Correction du problème d'images multiples générées par Copilot : les images n'ayant que des paramètres d'URL volatils différents ne sont plus fusionnées/dédupliquées à tort, permettant d'exporter toutes les images générées dans un seul message.
- Amélioration de la gestion des très longues conversations (plusieurs dizaines de messages) : les temps d'attente et le nombre d'étapes de défilement maximal ont été considérablement augmentés pour laisser le temps à Copilot de charger les anciens et les nouveaux messages sans s'arrêter prématurément.

### v1.4.2
- Correction définitive de l'affichage des images "en texte" dans les exports PDF/Print: les URLs `blob:` (incompatibles avec la page d'impression) sont désormais toutes correctement remplacées par leur équivalent `data:image/...` directement dans le contenu Markdown du message, garantissant l'affichage des images quelle que soit la méthode d'export.

### v1.4.1
- R?solution du problme du fallback HTML pour l'export PDF : si la conversation d?passe la limite de taille de Chrome (50MB) et que l'extension bascule sur l'export HTML de secours, les images s'affichent d?sormais correctement.
- Am?lioration de l'empreinte d'identification des messages : les messages trs courts (comme \Voici l'image : \) contenant des g?n?rations diff?rentes ne seront plus fusionn?s ni dupliqu?s suite au chargement asynchrone des images.

### v1.5.4 - v1.5.5 (fork amélioré)
- **Galeries d'images uploadées** : dépliage automatique des piles d'images multiples (« N images » / « +N ») pendant le balayage — seule la première image était capturée auparavant, les suivantes étaient masquées.
- Détection des pastilles de galerie sans rôle bouton explicite ; protection anti double-clic (les contrôles « Afficher moins » ne sont jamais cliqués).

### v1.5.6
- **Correction des doublons massifs** : fusion des messages par contenu (rôle + texte + première image stable) au fil du balayage ; les empreintes d'identification ne dérivent plus (URLs `blob:` exclues du calcul).

### v1.5.7
- Correction des derniers doublons (clé de fusion sans indice d'image pour les textes longs — les images générées arrivant après le texte entre deux passes).
- **Artefacts `blob:` (planches générées)** : récupérés pendant l'export tant que la page vit, au lieu de laisser des liens morts.
- Garde-fou sur le titre de conversation (repli si le titre vaut « Microsoft Copilot »).

### v1.5.8
- **Planches PDF générées par Copilot** : détection des vrais PDF (%PDF magic bytes), MIME `application/pdf` corrigé (au lieu de `application/octet-stream`), aperçu PDF intégré dans l'export HTML/PDF, fichiers `planches/*.pdf` dans l'export ZIP, marqueurs courts dans l'export TXT.

### v2.3.0
- Version store alignée sur la numérotation de la fiche Chrome Web Store.
