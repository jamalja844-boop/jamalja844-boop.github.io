<?php
/**
 * SEO Analyse.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Environment;
use CSAAM\Modules\AI_Optimizer;
use CSAAM\Modules\Seo_Audit;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

$results = Seo_Audit::results();
$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
$detail  = null;
foreach ( $results['pages'] as $p ) {
	if ( $p['post_id'] === $post_id ) {
		$detail = $p;
	}
}
$tasks = AI_Optimizer::tasks();

Admin::heading(
	__( 'SEO Analyse', 'clean-seo-ads-ai' ),
	sprintf(
		/* translators: %s: SEO-plugin */
		__( 'Controleert de live pagina\'s zoals Google ze ziet. Samenwerking met: %s — er worden geen dubbele metadata, sitemaps of schema toegevoegd.', 'clean-seo-ads-ai' ),
		Environment::seo_label( Environment::seo_plugin() )
	)
);
?>
<div class="csaam-card csaam-scanbar">
	<button type="button" class="button button-primary" data-csaam-scan><?php esc_html_e( 'Alle pagina\'s scannen', 'clean-seo-ads-ai' ); ?></button>
	<div class="csaam-progress" hidden><progress max="100" value="0"></progress> <span></span></div>
	<span class="csaam-muted">
		<?php
		echo $results['summary']['last']
			/* translators: %s: datum */
			? esc_html( sprintf( __( 'Laatste volledige scan: %s', 'clean-seo-ads-ai' ), wp_date( get_option( 'date_format' ) . ' H:i', $results['summary']['last'] ) ) )
			: esc_html__( 'Nog niet gescand. De scan draait daarna ook wekelijks automatisch.', 'clean-seo-ads-ai' );
		?>
	</span>
</div>

<?php if ( $detail ) : ?>
	<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-seo' ) ); ?>">← <?php esc_html_e( 'Alle pagina\'s', 'clean-seo-ads-ai' ); ?></a></p>
	<div class="csaam-card">
		<div class="csaam-detail-head">
			<?php Admin::score( $detail['score'] ); ?>
			<div>
				<h2><?php echo esc_html( $detail['title'] ); ?></h2>
				<a href="<?php echo esc_url( $detail['url'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $detail['url'] ); ?></a>
				· <a href="<?php echo esc_url( (string) $detail['edit_url'] ); ?>"><?php esc_html_e( 'Bewerken', 'clean-seo-ads-ai' ); ?></a>
			</div>
			<div class="csaam-head-actions">
				<button type="button" class="button" data-csaam-rescan="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php esc_html_e( 'Opnieuw scannen', 'clean-seo-ads-ai' ); ?></button>
				<button type="button" class="button" data-csaam-inspect="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php esc_html_e( 'Indexstatus bij Google', 'clean-seo-ads-ai' ); ?></button>
			</div>
		</div>
		<div class="csaam-inspect-result" hidden></div>

		<h3><?php esc_html_e( 'Fouten, kansen en voorgestelde correcties', 'clean-seo-ads-ai' ); ?></h3>
		<?php if ( ! $detail['issues'] ) : ?>
			<p><?php Admin::badge( 'good', __( 'Geen problemen gevonden', 'clean-seo-ads-ai' ) ); ?></p>
		<?php else : ?>
			<table class="widefat striped csaam-table">
				<thead><tr><th><?php esc_html_e( 'Ernst', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Probleem', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Voorgestelde correctie', 'clean-seo-ads-ai' ); ?></th><th></th></tr></thead>
				<tbody>
				<?php foreach ( $detail['issues'] as $issue ) : ?>
					<tr>
						<td><?php Admin::badge( $issue['severity'] ); ?></td>
						<td><?php echo esc_html( $issue['message'] ); ?></td>
						<td><?php echo esc_html( $issue['fix'] ); ?></td>
						<td>
							<?php if ( $issue['ai_task'] && isset( $tasks[ $issue['ai_task'] ] ) ) : ?>
								<button type="button" class="button button-small" data-csaam-ai="<?php echo esc_attr( $issue['ai_task'] ); ?>" data-post="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php esc_html_e( 'AI-voorstel', 'clean-seo-ads-ai' ); ?></button>
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>

	<div class="csaam-grid">
		<div class="csaam-card">
			<h3><?php esc_html_e( 'Metadata', 'clean-seo-ads-ai' ); ?></h3>
			<dl class="csaam-dl">
				<dt><?php esc_html_e( 'SEO-titel', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['title'] ? $detail['data']['title'] : '—' ); ?> <span class="csaam-muted">(<?php echo esc_html( (string) mb_strlen( $detail['data']['title'] ) ); ?>)</span></dd>
				<dt><?php esc_html_e( 'Meta description', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['description'] ? $detail['data']['description'] : '—' ); ?> <span class="csaam-muted">(<?php echo esc_html( (string) mb_strlen( $detail['data']['description'] ) ); ?>)</span></dd>
				<dt><?php esc_html_e( 'Canonical', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['canonicals'] ? implode( ', ', $detail['data']['canonicals'] ) : '—' ); ?></dd>
				<dt><?php esc_html_e( 'Robots', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['robots'] ? $detail['data']['robots'] : 'index, follow' ); ?></dd>
				<dt><?php esc_html_e( 'Structured data', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['schema']['types'] ? implode( ', ', $detail['data']['schema']['types'] ) : '—' ); ?></dd>
				<dt><?php esc_html_e( 'Woorden', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( Admin::num( $detail['data']['word_count'] ) ); ?></dd>
				<dt><?php esc_html_e( 'Interne / externe links', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['links']['internal'] . ' / ' . $detail['data']['links']['external'] ); ?></dd>
				<dt><?php esc_html_e( 'Afbeeldingen (zonder alt)', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['images']['total'] . ' (' . $detail['data']['images']['missing_alt'] . ')' ); ?></dd>
				<dt><?php esc_html_e( 'Laadtijd HTML (server)', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $detail['data']['ms'] ? $detail['data']['ms'] . ' ms' : '—' ); ?></dd>
			</dl>
			<p>
				<?php foreach ( array( 'seo_title', 'meta_description', 'content_review', 'internal_links', 'search_intent', 'missing_topics', 'landing_page' ) as $task ) : ?>
					<button type="button" class="button button-small" data-csaam-ai="<?php echo esc_attr( $task ); ?>" data-post="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php echo esc_html( $tasks[ $task ]['label'] ); ?></button>
				<?php endforeach; ?>
			</p>
		</div>
		<div class="csaam-card">
			<h3><?php esc_html_e( 'Kopstructuur', 'clean-seo-ads-ai' ); ?></h3>
			<?php if ( ! $detail['data']['headings'] ) : ?>
				<p class="csaam-muted"><?php esc_html_e( 'Geen koppen gevonden.', 'clean-seo-ads-ai' ); ?></p>
			<?php else : ?>
				<ul class="csaam-headings">
					<?php foreach ( $detail['data']['headings'] as $h ) : ?>
						<li style="--lvl:<?php echo (int) $h['level']; ?>"><span class="csaam-h">H<?php echo (int) $h['level']; ?></span> <?php echo esc_html( $h['text'] ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>
		</div>
		<div class="csaam-card">
			<h3><?php esc_html_e( 'Laadsnelheid en mobiel (PageSpeed Insights)', 'clean-seo-ads-ai' ); ?></h3>
			<p>
				<button type="button" class="button" data-csaam-pagespeed="mobile" data-post="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php esc_html_e( 'Mobiel testen', 'clean-seo-ads-ai' ); ?></button>
				<button type="button" class="button" data-csaam-pagespeed="desktop" data-post="<?php echo esc_attr( (string) $detail['post_id'] ); ?>"><?php esc_html_e( 'Desktop testen', 'clean-seo-ads-ai' ); ?></button>
			</p>
			<div class="csaam-pagespeed-result">
				<?php
				if ( ! empty( $detail['data']['pagespeed'] ) ) {
					foreach ( $detail['data']['pagespeed'] as $strategy => $ps ) {
						echo '<p><strong>' . esc_html( 'mobile' === $strategy ? __( 'Mobiel', 'clean-seo-ads-ai' ) : __( 'Desktop', 'clean-seo-ads-ai' ) ) . '</strong>: ';
						/* translators: 1: prestatie, 2: SEO, 3: LCP, 4: CLS */
						echo esc_html( sprintf( __( 'prestaties %1$s · SEO %2$s · LCP %3$s · CLS %4$s', 'clean-seo-ads-ai' ), $ps['scores']['performance'], $ps['scores']['seo'], $ps['metrics']['LCP'], $ps['metrics']['CLS'] ) ) . '</p>';
					}
				}
				?>
			</div>
		</div>
	</div>
<?php else : ?>
	<section class="csaam-tiles">
		<?php
		Admin::tile( __( 'Gemiddelde score', 'clean-seo-ads-ai' ), $results['summary']['pages'] ? $results['summary']['avg'] . '/100' : '—' );
		Admin::tile( __( 'Gescande pagina\'s', 'clean-seo-ads-ai' ), Admin::num( $results['summary']['pages'] ) );
		Admin::tile( __( 'Fouten', 'clean-seo-ads-ai' ), Admin::num( $results['summary']['errors'] ) );
		Admin::tile( __( 'Waarschuwingen', 'clean-seo-ads-ai' ), Admin::num( $results['summary']['warnings'] ) );
		Admin::tile( __( 'Verbeterkansen', 'clean-seo-ads-ai' ), Admin::num( $results['summary']['notices'] ) );
		?>
	</section>
	<div class="csaam-card">
		<?php if ( ! $results['pages'] ) : ?>
			<p><?php esc_html_e( 'Klik op "Alle pagina\'s scannen" om te beginnen.', 'clean-seo-ads-ai' ); ?></p>
		<?php else : ?>
			<div class="csaam-table-wrap">
			<table class="widefat striped csaam-table">
				<thead><tr><th><?php esc_html_e( 'Score', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Fouten', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Waarsch.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kansen', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Belangrijkste punt', 'clean-seo-ads-ai' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $results['pages'] as $p ) : ?>
					<tr>
						<td><?php Admin::score( $p['score'] ); ?></td>
						<td><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-seo&post=' . $p['post_id'] ) ); ?>"><strong><?php echo esc_html( $p['title'] ); ?></strong></a><br><span class="csaam-muted csaam-url"><?php echo esc_html( wp_parse_url( $p['url'], PHP_URL_PATH ) ); ?></span></td>
						<td><?php echo esc_html( (string) $p['counts']['error'] ); ?></td>
						<td><?php echo esc_html( (string) $p['counts']['warning'] ); ?></td>
						<td><?php echo esc_html( (string) $p['counts']['notice'] ); ?></td>
						<td><?php echo esc_html( $p['issues'] ? $p['issues'][0]['message'] : '—' ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			</div>
		<?php endif; ?>
	</div>
<?php endif; ?>
