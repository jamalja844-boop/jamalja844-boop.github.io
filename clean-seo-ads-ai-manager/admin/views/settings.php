<?php
/**
 * Instellingen.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Integrations\Google_OAuth;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

$s       = Settings::all();
$secrets = Settings::secret_status();
$google  = Google_OAuth::status();

Admin::heading( __( 'Instellingen', 'clean-seo-ads-ai' ), __( 'Plaats nooit wachtwoorden of sleutels in e-mail of chat. Sleutels worden versleuteld opgeslagen; nog veiliger is ze als constante in wp-config.php te zetten.', 'clean-seo-ads-ai' ) );

$field = static function ( $key, $label, $help = '', $type = 'text' ) use ( $s ) {
	$value = $s[ $key ];
	echo '<div class="csaam-field"><label for="csaam-' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label>';
	if ( 'list' === $type ) {
		echo '<textarea id="csaam-' . esc_attr( $key ) . '" name="csaam[' . esc_attr( $key ) . ']" rows="5" class="large-text">' . esc_textarea( implode( "\n", (array) $value ) ) . '</textarea>';
	} elseif ( 'bool' === $type ) {
		echo '<input type="hidden" name="csaam[' . esc_attr( $key ) . ']" value="0"><label class="csaam-switch"><input type="checkbox" id="csaam-' . esc_attr( $key ) . '" name="csaam[' . esc_attr( $key ) . ']" value="1" ' . checked( (bool) $value, true, false ) . '> ' . esc_html__( 'Aan', 'clean-seo-ads-ai' ) . '</label>';
	} elseif ( is_array( $type ) ) {
		echo '<select id="csaam-' . esc_attr( $key ) . '" name="csaam[' . esc_attr( $key ) . ']">';
		foreach ( $type as $opt => $opt_label ) {
			echo '<option value="' . esc_attr( $opt ) . '" ' . selected( $value, $opt, false ) . '>' . esc_html( $opt_label ) . '</option>';
		}
		echo '</select>';
	} else {
		echo '<input type="' . esc_attr( $type ) . '" id="csaam-' . esc_attr( $key ) . '" name="csaam[' . esc_attr( $key ) . ']" value="' . esc_attr( (string) $value ) . '" class="regular-text"' . ( 'number' === $type ? ' step="any"' : '' ) . ( in_array( $key, array( 'gsc_site_url', 'ga4_property_id', 'ads_customer_id' ), true ) ? ' list="csaam-list-' . esc_attr( $key ) . '"' : '' ) . '>';
		if ( in_array( $key, array( 'gsc_site_url', 'ga4_property_id', 'ads_customer_id' ), true ) ) {
			echo '<datalist id="csaam-list-' . esc_attr( $key ) . '"></datalist>';
		}
	}
	if ( $help ) {
		echo '<p class="description">' . esc_html( $help ) . '</p>';
	}
	echo '</div>';
};

$secret = static function ( $name, $label, $help = '' ) use ( $secrets ) {
	$st = $secrets[ $name ];
	echo '<div class="csaam-field"><label for="csaam-secret-' . esc_attr( $name ) . '">' . esc_html( $label ) . '</label>';
	if ( 'wp-config.php' === $st['source'] ) {
		echo '<p><span class="csaam-badge is-good"><span aria-hidden="true">✓</span> ' . esc_html__( 'Ingesteld via wp-config.php', 'clean-seo-ads-ai' ) . '</span></p>';
	} else {
		echo '<input type="password" autocomplete="new-password" id="csaam-secret-' . esc_attr( $name ) . '" name="csaam_secret[' . esc_attr( $name ) . ']" value="" class="regular-text" placeholder="' . esc_attr( $st['set'] ? $st['hint'] . ' — ' . __( 'opgeslagen; leeg laten om te behouden', 'clean-seo-ads-ai' ) : __( 'Niet ingesteld', 'clean-seo-ads-ai' ) ) . '">';
		if ( $st['set'] ) {
			echo ' <label><input type="checkbox" name="csaam_secret_remove[' . esc_attr( $name ) . ']" value="1"> ' . esc_html__( 'Verwijderen', 'clean-seo-ads-ai' ) . '</label>';
		}
	}
	if ( $help ) {
		echo '<p class="description">' . esc_html( $help ) . '</p>';
	}
	echo '</div>';
};
?>

<div class="csaam-card" id="google">
	<h2><?php esc_html_e( 'Google-koppeling (OAuth 2.0)', 'clean-seo-ads-ai' ); ?></h2>
	<p>
		<?php if ( $google['connected'] ) : ?>
			<?php Admin::badge( 'ok', __( 'Gekoppeld', 'clean-seo-ads-ai' ) ); ?>
			<span class="csaam-muted">
				<?php
				/* translators: %s: datum */
				echo esc_html( sprintf( __( 'sinds %s', 'clean-seo-ads-ai' ), wp_date( get_option( 'date_format' ), $google['connected_at'] ) ) );
				?>
			</span>
			<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=csaam_google_disconnect' ), 'csaam_google_disconnect' ) ); ?>"><?php esc_html_e( 'Ontkoppelen', 'clean-seo-ads-ai' ); ?></a>
			<button type="button" class="button" data-csaam-google-options><?php esc_html_e( 'Accounts ophalen uit Google', 'clean-seo-ads-ai' ); ?></button>
		<?php elseif ( $google['configured'] ) : ?>
			<?php Admin::badge( 'warning', __( 'Nog niet gekoppeld', 'clean-seo-ads-ai' ) ); ?>
			<a class="button button-primary" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=csaam_google_connect' ), 'csaam_google_connect' ) ); ?>"><?php esc_html_e( 'Koppelen met Google', 'clean-seo-ads-ai' ); ?></a>
		<?php else : ?>
			<?php Admin::badge( 'missing', __( 'Vul eerst Client ID en Client Secret in en sla op', 'clean-seo-ads-ai' ) ); ?>
		<?php endif; ?>
	</p>
	<div class="csaam-google-options-result" role="status"></div>
	<details>
		<summary><?php esc_html_e( 'Stappenplan Google Cloud (actuele methode sinds 9 september 2026)', 'clean-seo-ads-ai' ); ?></summary>
		<ol class="csaam-steps">
			<li><?php esc_html_e( 'Maak in Google Cloud Console een project (of kies een bestaand project voor alleen deze website).', 'clean-seo-ads-ai' ); ?></li>
			<li><?php esc_html_e( 'Schakel in: Google Ads API, Google Search Console API, Google Analytics Data API, Google Analytics Admin API en PageSpeed Insights API.', 'clean-seo-ads-ai' ); ?></li>
			<li><?php esc_html_e( 'Google Ads API → Overzicht: het project krijgt automatisch Test-toegang (alleen testaccounts). Vraag Explorer-toegang aan voor uw echte account (max. 2.880 operaties/dag; ruim voldoende voor alleen-lezen rapportages). Een developer token is niet meer nodig.', 'clean-seo-ads-ai' ); ?></li>
			<li><?php esc_html_e( 'OAuth-toestemmingsscherm: type Extern, voeg de drie scopes toe en zet de publicatiestatus op "In productie" (in "Testen" verlopen tokens na 7 dagen).', 'clean-seo-ads-ai' ); ?></li>
			<li><?php esc_html_e( 'Credentials → OAuth-client-ID → type "Webapplicatie". Voeg deze geautoriseerde redirect-URI toe:', 'clean-seo-ads-ai' ); ?> <code><?php echo esc_html( $google['redirect_uri'] ); ?></code></li>
			<li><?php esc_html_e( 'Plak hieronder de Client ID en Client Secret (of zet de secret als CSAAM_GOOGLE_CLIENT_SECRET in wp-config.php), sla op en klik op "Koppelen met Google" met het Google-account dat toegang heeft tot Ads, Search Console en GA4.', 'clean-seo-ads-ai' ); ?></li>
		</ol>
	</details>
</div>

<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="csaam-settings-form">
	<input type="hidden" name="action" value="csaam_save_settings">
	<input type="hidden" name="csaam_tab" value="">
	<?php wp_nonce_field( 'csaam_save_settings' ); ?>

	<div class="csaam-grid">
		<div class="csaam-card">
			<h2><?php esc_html_e( 'Google-accounts', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$field( 'google_client_id', __( 'OAuth Client ID', 'clean-seo-ads-ai' ) );
			$secret( 'google_client_secret', __( 'OAuth Client Secret', 'clean-seo-ads-ai' ) );
			$field( 'gsc_site_url', __( 'Search Console-property', 'clean-seo-ads-ai' ), __( 'Bijv. sc-domain:cleanschoonmaakbedrijf.nl of https://cleanschoonmaakbedrijf.nl/', 'clean-seo-ads-ai' ) );
			$field( 'ga4_property_id', __( 'GA4-property-ID', 'clean-seo-ads-ai' ), __( 'Alleen het nummer, bijv. 123456789.', 'clean-seo-ads-ai' ) );
			$field( 'ads_customer_id', __( 'Google Ads-klant-ID', 'clean-seo-ads-ai' ), __( 'Bijv. 123-456-7890 (streepjes mogen).', 'clean-seo-ads-ai' ) );
			$field( 'ads_login_customer_id', __( 'Login-customer-ID (MCC)', 'clean-seo-ads-ai' ), __( 'Alleen invullen als u via een beheerdersaccount (MCC) toegang heeft.', 'clean-seo-ads-ai' ) );
			$field( 'ads_api_version', __( 'Google Ads API-versie', 'clean-seo-ads-ai' ), __( 'Standaard v26 (oktober 2026). Google ondersteunt elke versie ±1 jaar.', 'clean-seo-ads-ai' ) );
			$field( 'ads_daily_op_limit', __( 'Max. Ads-API-verzoeken per dag', 'clean-seo-ads-ai' ), __( 'Bescherming tegen het quotum (Explorer: 2.880/dag).', 'clean-seo-ads-ai' ), 'number' );
			$secret( 'ads_developer_token', __( 'Developer token (optioneel, verouderd)', 'clean-seo-ads-ai' ), __( 'Sinds 9 september 2026 genegeerd door Google; alleen invullen als u er een heeft.', 'clean-seo-ads-ai' ) );
			$secret( 'pagespeed_api_key', __( 'PageSpeed Insights API-sleutel (optioneel)', 'clean-seo-ads-ai' ), __( 'Verhoogt het quotum. Beperk de sleutel in Google Cloud tot de PageSpeed Insights API.', 'clean-seo-ads-ai' ) );
			?>
		</div>

		<div class="csaam-card" id="ai">
			<h2><?php esc_html_e( 'AI (Claude)', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$secret( 'anthropic_api_key', __( 'Claude API-sleutel', 'clean-seo-ads-ai' ), __( 'Aan te maken op platform.claude.com. Of zet CSAAM_ANTHROPIC_API_KEY in wp-config.php.', 'clean-seo-ads-ai' ) );
			$field(
				'ai_model',
				__( 'Model', 'clean-seo-ads-ai' ),
				__( 'Opus 5.5: beste kwaliteit ($4/$20 per miljoen tokens). Sonnet 5.5: sneller en goedkoper ($2/$10). Haiku 5.5: goedkoopst ($0,10/$0,50), geschikt voor titels en descriptions.', 'clean-seo-ads-ai' ),
				array(
					'claude-opus-5-5'   => 'Claude Opus 5.5',
					'claude-sonnet-5-5' => 'Claude Sonnet 5.5',
					'claude-haiku-5-5'  => 'Claude Haiku 5.5',
				)
			);
			$field(
				'ai_effort',
				__( 'Denkdiepte (effort)', 'clean-seo-ads-ai' ),
				__( 'Hoger = grondiger maar duurder en trager.', 'clean-seo-ads-ai' ),
				array(
					'low'    => __( 'Laag', 'clean-seo-ads-ai' ),
					'medium' => __( 'Gemiddeld', 'clean-seo-ads-ai' ),
					'high'   => __( 'Hoog', 'clean-seo-ads-ai' ),
				)
			);
			$field( 'ai_monthly_budget', __( 'Maandbudget AI (USD)', 'clean-seo-ads-ai' ), __( 'Bij het bereiken van dit bedrag worden nieuwe AI-verzoeken geblokkeerd. 0 = geen limiet.', 'clean-seo-ads-ai' ), 'number' );
			$field( 'ai_max_tokens', __( 'Max. tokens per antwoord', 'clean-seo-ads-ai' ), '', 'number' );
			$field( 'ai_requests_per_hour', __( 'Max. AI-verzoeken per uur', 'clean-seo-ads-ai' ), '', 'number' );
			$field( 'ai_fallbacks', __( 'Automatische fallback bij weigering', 'clean-seo-ads-ai' ), __( 'Laat Anthropic een geweigerd verzoek op een ander model uitvoeren (alleen Opus/Sonnet).', 'clean-seo-ads-ai' ), 'bool' );
			?>
			<p class="description"><?php esc_html_e( 'Logging bewaart alleen taak, model, tokens en kosten — nooit prompts, paginateksten of sleutels.', 'clean-seo-ads-ai' ); ?></p>
		</div>
	</div>

	<div class="csaam-grid">
		<div class="csaam-card">
			<h2><?php esc_html_e( 'Bedrijf en werkgebied', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$field( 'company_name', __( 'Bedrijfsnaam', 'clean-seo-ads-ai' ) );
			$field( 'company_website', __( 'Website', 'clean-seo-ads-ai' ), '', 'url' );
			$field( 'company_city', __( 'Vestigingsplaats', 'clean-seo-ads-ai' ) );
			$field( 'company_address', __( 'Adres (echt bezoek-/postadres)', 'clean-seo-ads-ai' ), __( 'Alleen voor de NAW-controle. Wordt niet op de site geplaatst.', 'clean-seo-ads-ai' ) );
			$field( 'company_phone', __( 'Telefoonnummer', 'clean-seo-ads-ai' ) );
			$field( 'company_usps', __( 'Bevestigde USP\'s (één per regel)', 'clean-seo-ads-ai' ), __( 'Alleen ware feiten, bijv. keurmerken die u echt heeft. De AI gebruikt niets anders.', 'clean-seo-ads-ai' ), 'list' );
			$field( 'cities', __( 'Werkgebied (één plaats per regel)', 'clean-seo-ads-ai' ), '', 'list' );
			$field( 'services', __( 'Diensten (één per regel)', 'clean-seo-ads-ai' ), '', 'list' );
			$field( 'target_keywords', __( 'Doelzoekwoorden (één per regel)', 'clean-seo-ads-ai' ), '', 'list' );
			?>
		</div>
		<div class="csaam-card" id="conversions">
			<h2><?php esc_html_e( 'Conversies en privacy', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$field( 'tracking_enabled', __( 'Leadmeting', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'tracking_forms', __( 'Formulierinzendingen tellen', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'tracking_phone', __( 'Telefoonklikken (tel:)', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'tracking_email', __( 'E-mailklikken (mailto:)', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'tracking_whatsapp', __( 'WhatsApp-klikken', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'tracking_quote_forms', __( 'Woorden in formuliernaam voor "offerteaanvraag"', 'clean-seo-ads-ai' ), __( 'Eén per regel, bijv. offerte, aanvraag.', 'clean-seo-ads-ai' ), 'list' );
			$field( 'tracking_selectors', __( 'CSS-selectors van offerteknoppen (optioneel)', 'clean-seo-ads-ai' ), __( 'Bijv. a[href*="offerte"] of .btn-offerte — één per regel.', 'clean-seo-ads-ai' ), 'list' );
			$field(
				'tracking_datalayer',
				__( 'Doorsturen naar GA4/Google Ads', 'clean-seo-ads-ai' ),
				__( 'Automatisch: alleen als GTM of gtag al op de site staat. De plugin plaatst zelf nooit een Google-tag.', 'clean-seo-ads-ai' ),
				array(
					'auto' => __( 'Automatisch (aanbevolen)', 'clean-seo-ads-ai' ),
					'on'   => __( 'Altijd naar dataLayer', 'clean-seo-ads-ai' ),
					'off'  => __( 'Uit', 'clean-seo-ads-ai' ),
				)
			);
			$field( 'tracking_consent', __( 'Wacht op toestemming (WP Consent API)', 'clean-seo-ads-ai' ), __( 'Als een consentplugin de WP Consent API ondersteunt, wordt pas na toestemming voor statistieken geteld.', 'clean-seo-ads-ai' ), 'bool' );
			?>
		</div>
	</div>

	<div class="csaam-grid">
		<div class="csaam-card" id="reports">
			<h2><?php esc_html_e( 'Rapportages', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$field( 'report_monthly', __( 'Maandrapport per e-mail', 'clean-seo-ads-ai' ), '', 'bool' );
			$field( 'report_email', __( 'E-mailadres', 'clean-seo-ads-ai' ), '', 'email' );
			?>
		</div>
		<div class="csaam-card">
			<h2><?php esc_html_e( 'Algemeen', 'clean-seo-ads-ai' ); ?></h2>
			<?php
			$field( 'demo_mode', __( 'Demomodus', 'clean-seo-ads-ai' ), __( 'Toont duidelijk gemarkeerde voorbeeldgegevens voor Google-schermen. Nooit gebruiken voor echte beslissingen.', 'clean-seo-ads-ai' ), 'bool' );
			$field( 'cache_hours', __( 'Google-gegevens cachen (uren)', 'clean-seo-ads-ai' ), '', 'number' );
			echo '<div class="csaam-field"><span class="csaam-label">' . esc_html__( 'Te controleren berichttypes', 'clean-seo-ads-ai' ) . '</span><input type="hidden" name="csaam[audit_post_types][]" value="">';
			foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $pt ) {
				if ( 'attachment' === $pt->name ) {
					continue;
				}
				printf( '<label class="csaam-inline"><input type="checkbox" name="csaam[audit_post_types][]" value="%1$s" %2$s> %3$s</label> ', esc_attr( $pt->name ), checked( in_array( $pt->name, (array) $s['audit_post_types'], true ), true, false ), esc_html( $pt->labels->name ) );
			}
			echo '</div>';
			$field( 'seo_fallback_meta', __( 'Eigen title/description uitvoeren als er geen SEO-plugin is', 'clean-seo-ads-ai' ), __( 'Wordt automatisch genegeerd zodra Rank Math, Yoast, AIOSEO of SEOPress actief is.', 'clean-seo-ads-ai' ), 'bool' );
			$field( 'log_retention_days', __( 'Logboek bewaren (dagen)', 'clean-seo-ads-ai' ), '', 'number' );
			$field( 'event_retention_days', __( 'Leadgegevens bewaren (dagen)', 'clean-seo-ads-ai' ), '', 'number' );
			?>
		</div>
	</div>
	<p class="csaam-sticky-save"><?php submit_button( __( 'Instellingen opslaan', 'clean-seo-ads-ai' ), 'primary', 'submit', false ); ?></p>
</form>
