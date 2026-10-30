<?php
/**
 * Conversies en Leads.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Modules\Conversions;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Conversies en Leads', 'clean-seo-ads-ai' ), __( 'Offerteaanvragen, contactformulieren en klikken op telefoon, e-mail en WhatsApp — geteld zonder cookies of persoonsgegevens.', 'clean-seo-ads-ai' ), true );

$data = Conversions::overview( $days );
?>
<?php if ( ! Settings::get( 'tracking_enabled' ) ) : ?>
	<div class="notice notice-warning inline"><p><?php esc_html_e( 'Leadmeting staat uit. Zet deze aan bij Instellingen → Conversies.', 'clean-seo-ads-ai' ); ?></p></div>
<?php endif; ?>
<section class="csaam-tiles">
	<?php
	foreach ( $data['labels'] as $type => $label ) {
		Admin::tile( $label, Admin::num( isset( $data['totals'][ $type ] ) ? $data['totals'][ $type ] : 0 ) );
	}
	?>
</section>
<div class="csaam-grid">
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $data['daily'] as $d ) {
			$points[] = array( $d['date'], $d['quote_form'] );
		}
		Admin::chart( $points, __( 'Offerteaanvragen per dag', 'clean-seo-ads-ai' ), '', true );
		?>
	</div>
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $data['daily'] as $d ) {
			$points[] = array( $d['date'], $d['phone'] );
		}
		Admin::chart( $points, __( 'Telefoonklikken per dag', 'clean-seo-ads-ai' ), '', true );
		?>
	</div>
</div>
<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Pagina\'s met de meeste leads', 'clean-seo-ads-ai' ); ?></h2>
		<table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Leads', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $data['pages'] as $p ) : ?>
				<tr><td class="csaam-url"><?php echo esc_html( $p['page_path'] ); ?></td><td><?php echo esc_html( Admin::num( $p['total'] ) ); ?></td></tr>
			<?php endforeach; ?>
			<?php if ( ! $data['pages'] ) : ?>
				<tr><td colspan="2" class="csaam-muted"><?php esc_html_e( 'Nog geen leads gemeten in deze periode.', 'clean-seo-ads-ai' ); ?></td></tr>
			<?php endif; ?>
			</tbody>
		</table>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Formulieren', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( $data['forms'] ) : ?>
			<table class="widefat striped csaam-table">
				<thead><tr><th><?php esc_html_e( 'Formulier', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Type', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Inzendingen', 'clean-seo-ads-ai' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $data['forms'] as $f ) : ?>
					<tr><td><?php echo esc_html( $f['label'] ); ?></td><td><?php echo esc_html( $data['labels'][ $f['event_type'] ] ); ?></td><td><?php echo esc_html( Admin::num( $f['total'] ) ); ?></td></tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
		<dl class="csaam-dl">
			<dt><?php esc_html_e( 'Formulierplugins', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $data['env']['forms'] ? implode( ', ', $data['env']['forms'] ) : __( 'Geen ondersteunde formulierplugin gevonden', 'clean-seo-ads-ai' ) ); ?></dd>
			<dt><?php esc_html_e( 'Bestaande tracking', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $data['env']['tracking'] ? implode( ', ', $data['env']['tracking'] ) : '—' ); ?></dd>
			<dt><?php esc_html_e( 'Toestemming', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $data['env']['consent'] ? implode( ', ', $data['env']['consent'] ) : '—' ); ?></dd>
		</dl>
		<p class="csaam-muted"><?php esc_html_e( 'Formulieren waarvan de naam een van de ingestelde woorden bevat (standaard "offerte") tellen als offerteaanvraag. Aanpassen bij Instellingen → Conversies.', 'clean-seo-ads-ai' ); ?></p>
	</div>
</div>
<div class="csaam-card">
	<h2><?php esc_html_e( 'Hoe wordt er gemeten?', 'clean-seo-ads-ai' ); ?></h2>
	<ul class="csaam-list">
		<li><?php esc_html_e( 'Formulierinzendingen worden op de server geteld via Contact Form 7, Gravity Forms, WPForms, Elementor Pro, Fluent Forms, Ninja Forms of Formidable. Alleen formuliernaam, paginapad en tijdstip worden opgeslagen — nooit de ingevulde gegevens.', 'clean-seo-ads-ai' ); ?></li>
		<li><?php esc_html_e( 'Klikken op tel:, mailto: en WhatsApp-links worden met een cookieloos signaal geteld. Er worden geen IP-adressen opgeslagen. Ingelogde medewerkers worden niet meegeteld.', 'clean-seo-ads-ai' ); ?></li>
		<li><?php esc_html_e( 'Is Google Tag Manager of gtag (bijv. via Site Kit) al actief, dan stuurt de plugin de gebeurtenissen generate_lead, phone_click, email_click, whatsapp_click en quote_cta_click door. Google Consent Mode bepaalt wat Google daarmee mag. De plugin plaatst zelf geen Google-tag, dus er ontstaat geen dubbele tracking.', 'clean-seo-ads-ai' ); ?></li>
		<li><?php esc_html_e( 'Is de WP Consent API actief (bijv. via Complianz of CookieYes) en staat "Wacht op toestemming" aan, dan wordt pas geteld na toestemming voor statistieken.', 'clean-seo-ads-ai' ); ?></li>
	</ul>
</div>
