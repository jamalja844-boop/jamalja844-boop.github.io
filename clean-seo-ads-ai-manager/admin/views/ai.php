<?php
/**
 * AI Optimalisatie: Origineel / AI-voorstel / Verschillen / Goedkeuren.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Modules\AI_Optimizer;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

// phpcs:disable WordPress.Security.NonceVerification.Recommended
$proposal_id = isset( $_GET['proposal'] ) ? absint( $_GET['proposal'] ) : 0;
$status      = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : 'pending';
// phpcs:enable
$usage    = AI_Optimizer::usage();
$labels   = array(
	'pending'  => __( 'Wacht op besluit', 'clean-seo-ads-ai' ),
	'applied'  => __( 'Toegepast', 'clean-seo-ads-ai' ),
	'approved' => __( 'Goedgekeurd', 'clean-seo-ads-ai' ),
	'rejected' => __( 'Afgewezen', 'clean-seo-ads-ai' ),
);
$tasks    = AI_Optimizer::tasks();
$provider = AI_Optimizer::provider();

Admin::heading( __( 'AI Optimalisatie', 'clean-seo-ads-ai' ), __( 'Claude doet voorstellen; u beslist. Er wordt nooit iets automatisch gepubliceerd.', 'clean-seo-ads-ai' ) );

if ( ! $provider->configured() ) {
	echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'Er is nog geen Claude API-sleutel ingesteld. Voeg die toe bij Instellingen → AI (of als constante in wp-config.php).', 'clean-seo-ads-ai' ) . ( Settings::demo() ? ' ' . esc_html__( 'In de demomodus ziet u gemarkeerde voorbeeldvoorstellen.', 'clean-seo-ads-ai' ) : '' ) . '</p></div>';
}

/**
 * Lijst met strings.
 *
 * @param array $items Items.
 */
$csaam_list = static function ( $items ) {
	echo '<ul class="csaam-list">';
	foreach ( (array) $items as $item ) {
		echo '<li>' . esc_html( is_array( $item ) ? implode( ' — ', array_map( 'strval', $item ) ) : (string) $item ) . '</li>';
	}
	echo '</ul>';
};

if ( $proposal_id ) :
	$item = AI_Optimizer::get( $proposal_id );
	if ( is_wp_error( $item ) ) {
		Admin::empty_state( $item );
		return;
	}
	$p       = $item['proposal'];
	$pending = 'pending' === $item['status'];
	?>
	<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-ai' ) ); ?>">← <?php esc_html_e( 'Alle voorstellen', 'clean-seo-ads-ai' ); ?></a></p>
	<div class="csaam-card csaam-review" data-proposal="<?php echo esc_attr( (string) $item['id'] ); ?>" data-field="<?php echo esc_attr( $item['field'] ); ?>">
		<div class="csaam-detail-head">
			<div>
				<h2><?php echo esc_html( $item['task_label'] . ' — ' . $item['post_title'] ); ?></h2>
				<span class="csaam-muted">
					<?php
					/* translators: 1: model, 2: tokens, 3: kosten */
					echo esc_html( sprintf( __( 'Model: %1$s · %2$s tokens · $ %3$s', 'clean-seo-ads-ai' ), $item['model'], number_format_i18n( $item['tokens'] ), number_format_i18n( $item['cost'], 4 ) ) );
					?>
				</span>
				<?php if ( $item['truncated'] ) : ?>
					<p class="csaam-warning-text"><?php esc_html_e( 'Let op: de pagina was erg lang; alleen het eerste deel is aan de AI gegeven.', 'clean-seo-ads-ai' ); ?></p>
				<?php endif; ?>
			</div>
			<div><?php Admin::badge( $pending ? 'notice' : ( 'rejected' === $item['status'] ? 'missing' : 'ok' ), $labels[ $item['status'] ] ); ?></div>
		</div>

		<div class="csaam-tabs" role="tablist">
			<button type="button" role="tab" aria-selected="true" data-tab="original"><?php esc_html_e( '1. Origineel', 'clean-seo-ads-ai' ); ?></button>
			<button type="button" role="tab" aria-selected="false" data-tab="proposal"><?php esc_html_e( '2. AI-voorstel', 'clean-seo-ads-ai' ); ?></button>
			<button type="button" role="tab" aria-selected="false" data-tab="diff"><?php esc_html_e( '3. Verschillen', 'clean-seo-ads-ai' ); ?></button>
			<button type="button" role="tab" aria-selected="false" data-tab="approve"><?php esc_html_e( '4. Goedkeuren', 'clean-seo-ads-ai' ); ?></button>
		</div>

		<section class="csaam-tab" data-panel="original">
			<?php if ( 'content' === $item['field'] ) : ?>
				<div class="csaam-preview"><?php echo wp_kses_post( $item['original'] ); ?></div>
			<?php elseif ( $item['original'] ) : ?>
				<p class="csaam-big"><?php echo esc_html( $item['original'] ); ?></p>
				<p class="csaam-muted"><?php echo esc_html( sprintf( /* translators: %d: tekens */ __( '%d tekens', 'clean-seo-ads-ai' ), mb_strlen( $item['original'] ) ) ); ?></p>
			<?php elseif ( $item['post_url'] ) : ?>
				<p><?php esc_html_e( 'Deze analyse gaat over de hele pagina:', 'clean-seo-ads-ai' ); ?> <a href="<?php echo esc_url( $item['post_url'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $item['post_url'] ); ?></a></p>
			<?php else : ?>
				<p><?php esc_html_e( 'Analyse van de Google Ads-gegevens van de laatste 30 dagen (alleen-lezen opgehaald).', 'clean-seo-ads-ai' ); ?></p>
			<?php endif; ?>
		</section>

		<section class="csaam-tab" data-panel="proposal" hidden>
			<?php
			foreach ( array( 'analysis', 'summary' ) as $key ) {
				if ( ! empty( $p[ $key ] ) ) {
					echo '<p>' . esc_html( $p[ $key ] ) . '</p>';
				}
			}
			if ( ! empty( $p['primary_intent'] ) ) {
				echo '<p><strong>' . esc_html__( 'Hoofdintentie:', 'clean-seo-ads-ai' ) . '</strong> ' . esc_html( $p['primary_intent'] ) . '</p>';
			}
			if ( isset( $p['score'] ) ) {
				echo '<p><strong>' . esc_html__( 'Beoordeling:', 'clean-seo-ads-ai' ) . '</strong> ' . esc_html( (string) (int) $p['score'] ) . '/100</p>';
			}
			if ( ! empty( $p['options'] ) ) {
				echo '<fieldset class="csaam-options"><legend>' . esc_html__( 'Kies een optie (u kunt hem bij Goedkeuren nog aanpassen)', 'clean-seo-ads-ai' ) . '</legend>';
				foreach ( $p['options'] as $i => $opt ) {
					printf(
						'<label class="csaam-option"><input type="radio" name="csaam-option" value="%1$s" %2$s %3$s><span><strong>%4$s</strong> <span class="csaam-muted">(%5$d)</span><br><small>%6$s</small></span></label>',
						esc_attr( $opt['text'] ),
						checked( 0, $i, false ),
						disabled( ! $pending, true, false ),
						esc_html( $opt['text'] ),
						(int) mb_strlen( $opt['text'] ),
						esc_html( $opt['rationale'] )
					);
				}
				echo '</fieldset>';
			}
			if ( ! empty( $p['strengths'] ) ) {
				echo '<h3>' . esc_html__( 'Sterke punten', 'clean-seo-ads-ai' ) . '</h3>';
				$csaam_list( $p['strengths'] );
			}
			$tables = array(
				'improvements'    => array(
					__( 'Verbeteringen', 'clean-seo-ads-ai' ),
					array(
						'priority'   => __( 'Prioriteit', 'clean-seo-ads-ai' ),
						'problem'    => __( 'Probleem', 'clean-seo-ads-ai' ),
						'suggestion' => __( 'Voorstel', 'clean-seo-ads-ai' ),
					),
				),
				'links'           => array(
					__( 'Interne links', 'clean-seo-ads-ai' ),
					array(
						'anchor_text' => __( 'Ankertekst', 'clean-seo-ads-ai' ),
						'target_url'  => __( 'Doel', 'clean-seo-ads-ai' ),
						'placement'   => __( 'Plaats', 'clean-seo-ads-ai' ),
						'reason'      => __( 'Waarom', 'clean-seo-ads-ai' ),
					),
				),
				'queries'         => array(
					__( 'Zoekintenties', 'clean-seo-ads-ai' ),
					array(
						'query'          => __( 'Zoekopdracht', 'clean-seo-ads-ai' ),
						'intent'         => __( 'Intentie', 'clean-seo-ads-ai' ),
						'fit'            => __( 'Aansluiting', 'clean-seo-ads-ai' ),
						'recommendation' => __( 'Advies', 'clean-seo-ads-ai' ),
					),
				),
				'topics'          => array(
					__( 'Ontbrekende onderwerpen', 'clean-seo-ads-ai' ),
					array(
						'topic'   => __( 'Onderwerp', 'clean-seo-ads-ai' ),
						'heading' => __( 'Voorgestelde H2', 'clean-seo-ads-ai' ),
						'why'     => __( 'Waarom', 'clean-seo-ads-ai' ),
					),
				),
				'recommendations' => array(
					__( 'Aanbevelingen', 'clean-seo-ads-ai' ),
					array(
						'area'           => __( 'Onderdeel', 'clean-seo-ads-ai' ),
						'priority'       => __( 'Prioriteit', 'clean-seo-ads-ai' ),
						'title'          => __( 'Voorstel', 'clean-seo-ads-ai' ),
						'detail'         => __( 'Toelichting', 'clean-seo-ads-ai' ),
						'how_to_measure' => __( 'Meten', 'clean-seo-ads-ai' ),
						'risk'           => __( 'Risico', 'clean-seo-ads-ai' ),
					),
				),
			);
			foreach ( $tables as $key => $def ) {
				if ( empty( $p[ $key ] ) ) {
					continue;
				}
				echo '<h3>' . esc_html( $def[0] ) . '</h3><div class="csaam-table-wrap"><table class="widefat striped csaam-table"><thead><tr>';
				foreach ( $def[1] as $label ) {
					echo '<th>' . esc_html( $label ) . '</th>';
				}
				echo '</tr></thead><tbody>';
				foreach ( $p[ $key ] as $row ) {
					echo '<tr>';
					foreach ( array_keys( $def[1] ) as $col ) {
						echo '<td>' . esc_html( isset( $row[ $col ] ) ? (string) $row[ $col ] : '' ) . '</td>';
					}
					echo '</tr>';
				}
				echo '</tbody></table></div>';
			}
			if ( ! empty( $p['faq'] ) ) {
				echo '<h3>' . esc_html__( 'Veelgestelde vragen', 'clean-seo-ads-ai' ) . '</h3>';
				$csaam_list( $p['faq'] );
			}
			if ( ! empty( $p['changes'] ) ) {
				echo '<h3>' . esc_html__( 'Wijzigingen', 'clean-seo-ads-ai' ) . '</h3>';
				$csaam_list( $p['changes'] );
			}
			if ( ! empty( $p['html'] ) ) {
				echo '<h3>' . esc_html__( 'Voorgestelde tekst', 'clean-seo-ads-ai' ) . '</h3><div class="csaam-preview">' . wp_kses_post( $p['html'] ) . '</div>';
			}
			?>
		</section>

		<section class="csaam-tab" data-panel="diff" hidden>
			<?php if ( $item['diff'] ) : ?>
				<div class="csaam-diff"><?php echo wp_kses_post( $item['diff'] ); ?></div>
			<?php else : ?>
				<p class="csaam-muted"><?php esc_html_e( 'Dit is een analyse/advies; er is geen tekst om te vergelijken.', 'clean-seo-ads-ai' ); ?></p>
			<?php endif; ?>
		</section>

		<section class="csaam-tab" data-panel="approve" hidden>
			<?php if ( ! $pending ) : ?>
				<p>
					<?php
					/* translators: 1: status, 2: datum */
					echo esc_html( sprintf( __( 'Status: %1$s op %2$s.', 'clean-seo-ads-ai' ), $labels[ $item['status'] ], $item['decided_at'] ? get_date_from_gmt( $item['decided_at'], get_option( 'date_format' ) . ' H:i' ) : '—' ) );
					?>
				</p>
				<?php if ( ! empty( $p['applied_text'] ) ) : ?>
					<p><strong><?php esc_html_e( 'Toegepaste tekst:', 'clean-seo-ads-ai' ); ?></strong> <?php echo esc_html( $p['applied_text'] ); ?></p>
				<?php endif; ?>
			<?php else : ?>
				<?php if ( in_array( $item['field'], array( 'title', 'description' ), true ) ) : ?>
					<label for="csaam-final"><strong><?php esc_html_e( 'Definitieve tekst', 'clean-seo-ads-ai' ); ?></strong></label>
					<textarea id="csaam-final" class="large-text" rows="2" maxlength="320"><?php echo esc_textarea( ! empty( $p['options'][0]['text'] ) ? $p['options'][0]['text'] : '' ); ?></textarea>
					<p class="csaam-muted"><span data-csaam-count></span> · <?php esc_html_e( 'Wordt opgeslagen in de SEO-instellingen van deze pagina.', 'clean-seo-ads-ai' ); ?></p>
				<?php elseif ( 'content' === $item['field'] ) : ?>
					<p><?php esc_html_e( 'Bij goedkeuring maakt de plugin een conceptpagina met deze tekst. De live pagina blijft ongewijzigd tot u het concept zelf controleert en publiceert.', 'clean-seo-ads-ai' ); ?></p>
				<?php else : ?>
					<p><?php esc_html_e( 'Dit is advies. Goedkeuren zet het op uw takenlijst; de plugin wijzigt zelf niets (ook niet in Google Ads).', 'clean-seo-ads-ai' ); ?></p>
				<?php endif; ?>
				<p>
					<button type="button" class="button button-primary" data-csaam-decide="approve"><?php esc_html_e( 'Goedkeuren', 'clean-seo-ads-ai' ); ?></button>
					<button type="button" class="button" data-csaam-decide="reject"><?php esc_html_e( 'Afwijzen', 'clean-seo-ads-ai' ); ?></button>
				</p>
			<?php endif; ?>
			<div class="csaam-result" role="status"></div>
		</section>
	</div>
	<?php
	return;
endif;
?>
<section class="csaam-tiles">
	<?php
	Admin::tile( __( 'AI-kosten deze maand', 'clean-seo-ads-ai' ), '$ ' . number_format_i18n( $usage['cost'], 2 ), null, sprintf( /* translators: %s: budget */ __( 'van $ %s budget', 'clean-seo-ads-ai' ), number_format_i18n( $usage['budget'], 2 ) ) );
	Admin::tile( __( 'Verzoeken deze maand', 'clean-seo-ads-ai' ), Admin::num( $usage['requests'] ) );
	Admin::tile( __( 'Model', 'clean-seo-ads-ai' ), Settings::get( 'ai_model' ), null, $provider->label() );
	Admin::tile( __( 'Wacht op goedkeuring', 'clean-seo-ads-ai' ), Admin::num( count( AI_Optimizer::all( 'pending' ) ) ) );
	?>
</section>

<div class="csaam-card">
	<h2><?php esc_html_e( 'Nieuw voorstel', 'clean-seo-ads-ai' ); ?></h2>
	<div class="csaam-form-row">
		<label><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?>
			<?php
			wp_dropdown_pages(
				array(
					'name'             => 'csaam-ai-post',
					'id'               => 'csaam-ai-post',
					'show_option_none' => esc_html__( '— Kies een pagina —', 'clean-seo-ads-ai' ),
					'post_status'      => 'publish',
				)
			);
			?>
		</label>
		<label><?php esc_html_e( 'Opdracht', 'clean-seo-ads-ai' ); ?>
			<select id="csaam-ai-task">
				<?php foreach ( $tasks as $key => $task ) : ?>
					<?php
					if ( 'page' !== $task['scope'] ) {
						continue;
					}
					?>
					<option value="<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $task['label'] ); ?></option>
				<?php endforeach; ?>
			</select>
		</label>
		<button type="button" class="button button-primary" data-csaam-ai-form><?php esc_html_e( 'Voorstel maken', 'clean-seo-ads-ai' ); ?></button>
		<button type="button" class="button" data-csaam-ai="ads_review" data-post="0"><?php esc_html_e( 'Google Ads analyseren', 'clean-seo-ads-ai' ); ?></button>
	</div>
	<p class="csaam-muted"><?php esc_html_e( 'De AI krijgt de pagina-inhoud, de kopstructuur, uw bedrijfscontext en (indien gekoppeld) Search Console-zoekopdrachten. Er worden geen API-sleutels, persoonsgegevens of formulierinzendingen meegestuurd.', 'clean-seo-ads-ai' ); ?></p>
	<div class="csaam-result" role="status"></div>
</div>

<div class="csaam-card">
	<h2><?php esc_html_e( 'Voorstellen', 'clean-seo-ads-ai' ); ?></h2>
	<p class="csaam-filter">
		<?php
		$filters = array(
			'pending'  => __( 'Wacht op besluit', 'clean-seo-ads-ai' ),
			'applied'  => __( 'Toegepast', 'clean-seo-ads-ai' ),
			'approved' => __( 'Goedgekeurd (handmatig)', 'clean-seo-ads-ai' ),
			'rejected' => __( 'Afgewezen', 'clean-seo-ads-ai' ),
			'all'      => __( 'Alles', 'clean-seo-ads-ai' ),
		);
		foreach ( $filters as $key => $label ) {
			printf( '<a href="%s" class="%s">%s</a> ', esc_url( admin_url( 'admin.php?page=csaam-ai&status=' . $key ) ), $status === $key ? 'is-active' : '', esc_html( $label ) );
		}
		?>
	</p>
	<?php $items = AI_Optimizer::all( 'all' === $status ? '' : $status ); ?>
	<?php if ( ! $items ) : ?>
		<p class="csaam-muted"><?php esc_html_e( 'Geen voorstellen.', 'clean-seo-ads-ai' ); ?></p>
	<?php else : ?>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Datum', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Opdracht', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Status', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kosten', 'clean-seo-ads-ai' ); ?></th><th></th></tr></thead>
			<tbody>
			<?php foreach ( $items as $it ) : ?>
				<tr>
					<td><?php echo esc_html( get_date_from_gmt( $it['created_at'], get_option( 'date_format' ) . ' H:i' ) ); ?></td>
					<td><?php echo esc_html( $it['post_title'] ); ?></td>
					<td><?php echo esc_html( $it['task_label'] ); ?></td>
					<td><?php echo esc_html( $labels[ $it['status'] ] ); ?></td>
					<td>$ <?php echo esc_html( number_format_i18n( $it['cost'], 4 ) ); ?></td>
					<td><a class="button button-small" href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-ai&proposal=' . $it['id'] ) ); ?>"><?php esc_html_e( 'Bekijken', 'clean-seo-ads-ai' ); ?></a></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	<?php endif; ?>
</div>
