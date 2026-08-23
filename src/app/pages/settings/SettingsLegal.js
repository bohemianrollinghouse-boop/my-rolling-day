import { html } from "../../lib.js";

// ── Conditions d'utilisation (données statiques) ───────────────────────────

export const TERMS_SECTIONS = [
  { title: "Utilisation familiale", body: "My Rolling Day est concu pour organiser un foyer. Chaque membre reste responsable des informations qu'il ajoute ou partage." },
  { title: "Comptes et acces", body: "Garde tes acces confidentiels. Les invitations doivent etre partagees uniquement avec les personnes que tu souhaites ajouter au foyer." },
  { title: "Disponibilite", body: "Nous faisons au mieux pour maintenir l'application disponible, mais certaines fonctions peuvent dependre du navigateur, du reseau ou de Firebase." },
  { title: "Contenu", body: "Les informations saisies dans l'application doivent rester adaptees a un usage personnel ou familial, sans contenu illicite ni abusif." },
];

// ── Politique de confidentialité ───────────────────────────────────────────

export function PrivacyPolicyPage() {
  return html`
    <div className="support-legal-text">
      <p className="support-legal-intro">Dernière mise à jour : 6 mai 2026</p>

      <section className="support-legal-section">
        <h2>1. Présentation de l'application</h2>
        <p>My Rolling Day est une application d'organisation familiale actuellement proposée en version bêta privée.</p>
        <p>L'application permet notamment :</p>
        <ul className="support-legal-list">
          <li>la gestion de tâches,</li>
          <li>l'organisation des repas,</li>
          <li>la création de recettes,</li>
          <li>la gestion de listes et d'inventaires,</li>
          <li>la création de notes,</li>
          <li>la gestion de foyers partagés entre plusieurs utilisateurs.</li>
        </ul>
        <p>Responsable de l'application :</p>
        <p>Bohemian Rolling House — Micro-entreprise<br/>SIRET : 89899821600045<br/>Responsable : Myendin Cachar</p>
        <p>Contact : <a className="support-legal-link" href="mailto:contact@bohemianrollinghouse.fr">contact@bohemianrollinghouse.fr</a></p>
      </section>

      <section className="support-legal-section">
        <h2>2. Données collectées</h2>
        <p>Lors de l'utilisation de My Rolling Day, certaines données peuvent être collectées et stockées afin d'assurer le bon fonctionnement de l'application.</p>
        <h3 className="support-legal-subh">Données de compte</h3>
        <ul className="support-legal-list">
          <li>adresse email,</li>
          <li>prénom ou pseudonyme,</li>
          <li>identifiants de connexion sécurisés via Firebase Authentication.</li>
        </ul>
        <p>Les mots de passe ne sont jamais visibles ni accessibles par le responsable de l'application.</p>
        <h3 className="support-legal-subh">Données liées au fonctionnement de l'application</h3>
        <p>Selon les fonctionnalités utilisées, les données suivantes peuvent être enregistrées :</p>
        <ul className="support-legal-list">
          <li>tâches,</li>
          <li>calendriers,</li>
          <li>repas,</li>
          <li>recettes,</li>
          <li>listes de courses,</li>
          <li>inventaire,</li>
          <li>notes,</li>
          <li>informations liées au foyer partagé,</li>
          <li>profils internes du foyer,</li>
          <li>photos ajoutées aux recettes.</li>
        </ul>
        <p>Les profils enfants présents dans l'application ne sont pas des comptes utilisateurs réels. Il s'agit uniquement d'éléments internes d'organisation familiale.</p>
      </section>

      <section className="support-legal-section">
        <h2>3. Notes privées et données personnelles</h2>
        <p>Certaines fonctionnalités permettent la création de contenus privés.</p>
        <p>Les notes privées sont uniquement visibles par leur créateur et ne sont pas accessibles aux autres membres du foyer.</p>
        <p>Certaines tâches ou éléments peuvent également être définis comme personnels selon les paramètres de l'application.</p>
      </section>

      <section className="support-legal-section">
        <h2>4. Fonctionnement des foyers partagés</h2>
        <p>My Rolling Day permet la création de foyers regroupant plusieurs utilisateurs.</p>
        <p>Selon les rôles attribués dans le foyer (administrateur ou membre), certains contenus ou paramètres peuvent être visibles ou modifiables uniquement par certaines personnes.</p>
        <p>Lorsqu'un utilisateur quitte un foyer, certains contenus précédemment créés peuvent rester visibles dans le foyer afin de préserver l'historique et l'organisation collective.</p>
      </section>

      <section className="support-legal-section">
        <h2>5. Hébergement et stockage des données</h2>
        <p>Les données de l'application sont hébergées via les services de Firebase, fournis par Google.</p>
        <p>Les serveurs utilisés pour cette version de l'application sont situés en Europe.</p>
        <p>Certaines données peuvent également être temporairement stockées localement sur l'appareil de l'utilisateur afin d'améliorer les performances et le fonctionnement hors ligne.</p>
      </section>

      <section className="support-legal-section">
        <h2>6. Notifications et emails</h2>
        <p>L'application peut utiliser :</p>
        <ul className="support-legal-list">
          <li>des notifications push,</li>
          <li>des rappels locaux sur l'appareil,</li>
          <li>des emails techniques (par exemple pour la réinitialisation du mot de passe).</li>
        </ul>
        <p>Aucun SMS n'est utilisé.</p>
      </section>

      <section className="support-legal-section">
        <h2>7. Photos et fichiers</h2>
        <p>Les utilisateurs peuvent ajouter des photos dans certaines fonctionnalités, notamment pour les recettes.</p>
        <p>Ces contenus :</p>
        <ul className="support-legal-list">
          <li>sont stockés sur Firebase,</li>
          <li>sont visibles par les membres du foyer concernés,</li>
          <li>peuvent être supprimés par l'utilisateur via la suppression du contenu associé.</li>
        </ul>
      </section>

      <section className="support-legal-section">
        <h2>8. Statistiques et amélioration de l'application</h2>
        <p>Dans le cadre de l'amélioration de l'application, certaines données techniques anonymes peuvent être collectées, notamment :</p>
        <ul className="support-legal-list">
          <li>statistiques d'utilisation,</li>
          <li>rapports de bugs,</li>
          <li>crashs,</li>
          <li>performances générales de l'application.</li>
        </ul>
        <p>Ces informations sont utilisées uniquement pour améliorer My Rolling Day.</p>
      </section>

      <section className="support-legal-section">
        <h2>9. Publicité et utilisation commerciale des données</h2>
        <p>À ce jour :</p>
        <ul className="support-legal-list">
          <li>aucune publicité ciblée n'est utilisée,</li>
          <li>aucune donnée personnelle n'est vendue,</li>
          <li>aucune donnée n'est partagée à des fins commerciales.</li>
        </ul>
      </section>

      <section className="support-legal-section">
        <h2>10. Suppression des données</h2>
        <p>Les utilisateurs peuvent demander la suppression de leur compte et de leurs données personnelles en contactant :</p>
        <p><a className="support-legal-link" href="mailto:contact@bohemianrollinghouse.fr">contact@bohemianrollinghouse.fr</a></p>
        <p>Certaines données liées au fonctionnement collectif d'un foyer peuvent être conservées lorsqu'elles concernent l'organisation commune du foyer.</p>
      </section>

      <section className="support-legal-section">
        <h2>11. Sécurité</h2>
        <p>Des mesures de sécurité raisonnables sont mises en œuvre afin de protéger les données des utilisateurs.</p>
        <p>L'authentification et la gestion sécurisée des comptes sont assurées par Firebase Authentication.</p>
      </section>

      <section className="support-legal-section">
        <h2>12. Mineurs</h2>
        <p>My Rolling Day est une application destinée à l'organisation familiale et n'est pas spécifiquement destinée aux enfants.</p>
        <p>Les comptes utilisateurs doivent être créés par des personnes disposant de l'autorisation nécessaire pour utiliser les services proposés.</p>
      </section>

      <section className="support-legal-section">
        <h2>13. Évolution de l'application</h2>
        <p>My Rolling Day est actuellement en version bêta privée.</p>
        <p>Certaines fonctionnalités, y compris des options premium ou des abonnements, pourront être ajoutées ultérieurement. En cas d'évolution importante concernant les données personnelles, cette politique de confidentialité sera mise à jour.</p>
      </section>

      <section className="support-legal-section">
        <h2>14. Contact</h2>
        <p>Pour toute question concernant cette politique de confidentialité ou vos données personnelles :</p>
        <p><a className="support-legal-link" href="mailto:contact@bohemianrollinghouse.fr">contact@bohemianrollinghouse.fr</a></p>
      </section>
    </div>
  `;
}
