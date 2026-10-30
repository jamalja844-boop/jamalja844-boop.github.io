<?php
/**
 * Lees/schrijf SEO-titel en meta description via de actieve SEO-plugin.
 * Zonder SEO-plugin gebruikt de plugin eigen velden en geeft die alleen
 * weer als dat expliciet is ingeschakeld (geen dubbele metadata).
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Seo_Meta.
 */
class Seo_Meta {

	const META_KEYS = array(
		'rankmath' => array(
			'title'       => 'rank_math_title',
			'description' => 'rank_math_description',
			'focus'       => 'rank_math_focus_keyword',
		),
		'yoast'    => array(
			'title'       => '_yoast_wpseo_title',
			'description' => '_yoast_wpseo_metadesc',
			'focus'       => '_yoast_wpseo_focuskw',
		),
		'aioseo'   => array(
			'title'       => '_aioseo_title',
			'description' => '_aioseo_description',
			'focus'       => '',
		),
		'seopress' => array(
			'title'       => '_seopress_titles_title',
			'description' => '_seopress_titles_desc',
			'focus'       => '_seopress_analysis_target_kw',
		),
		''         => array(
			'title'       => '_csaam_seo_title',
			'description' => '_csaam_meta_description',
			'focus'       => '',
		),
	);

	/**
	 * Registreert frontend-uitvoer voor de fallback (alleen zonder SEO-plugin).
	 */
	public static function register() {
		if ( '' !== Environment::seo_plugin() || ! Settings::get( 'seo_fallback_meta' ) ) {
			return;
		}
		add_filter( 'pre_get_document_title', array( __CLASS__, 'filter_title' ), 20 );
		add_action( 'wp_head', array( __CLASS__, 'print_description' ), 1 );
	}

	/**
	 * Titel-fallback.
	 *
	 * @param string $title Titel.
	 * @return string
	 */
	public static function filter_title( $title ) {
		if ( is_singular() ) {
			$custom = get_post_meta( get_queried_object_id(), '_csaam_seo_title', true );
			if ( $custom ) {
				return $custom;
			}
		}
		return $title;
	}

	/**
	 * Meta description-fallback.
	 */
	public static function print_description() {
		if ( ! is_singular() ) {
			return;
		}
		$desc = get_post_meta( get_queried_object_id(), '_csaam_meta_description', true );
		if ( $desc ) {
			echo '<meta name="description" content="' . esc_attr( $desc ) . '" />' . "\n";
		}
	}

	/**
	 * Huidige waarden zoals opgeslagen in de SEO-plugin.
	 *
	 * @param int $post_id Bericht-ID.
	 * @return array{title:string,description:string,focus:string,source:string}
	 */
	public static function get( $post_id ) {
		$plugin = Environment::seo_plugin();
		$keys   = self::META_KEYS[ $plugin ];
		$out    = array(
			'title'       => (string) get_post_meta( $post_id, $keys['title'], true ),
			'description' => (string) get_post_meta( $post_id, $keys['description'], true ),
			'focus'       => $keys['focus'] ? (string) get_post_meta( $post_id, $keys['focus'], true ) : '',
			'source'      => Environment::seo_label( $plugin ),
		);
		if ( 'aioseo' === $plugin && ( '' === $out['title'] || '' === $out['description'] ) ) {
			$model = self::aioseo_model( $post_id );
			if ( $model ) {
				$out['title']       = $out['title'] ? $out['title'] : (string) $model->title;
				$out['description'] = $out['description'] ? $out['description'] : (string) $model->description;
			}
		}
		return $out;
	}

	/**
	 * Schrijft een veld naar de actieve SEO-plugin. Alleen na goedkeuring aanroepen.
	 *
	 * @param int    $post_id Bericht-ID.
	 * @param string $field   title|description.
	 * @param string $value   Nieuwe waarde.
	 * @return bool
	 */
	public static function set( $post_id, $field, $value ) {
		if ( ! in_array( $field, array( 'title', 'description' ), true ) ) {
			return false;
		}
		$plugin = Environment::seo_plugin();
		$value  = sanitize_text_field( $value );
		update_post_meta( $post_id, self::META_KEYS[ $plugin ][ $field ], $value );

		try {
			if ( 'aioseo' === $plugin ) {
				$model = self::aioseo_model( $post_id );
				if ( $model ) {
					$model->$field = $value;
					$model->save();
				}
			} elseif ( 'yoast' === $plugin && function_exists( 'YoastSEO' ) ) {
				$repo      = YoastSEO()->classes->get( 'Yoast\\WP\\SEO\\Repositories\\Indexable_Repository' );
				$builder   = YoastSEO()->classes->get( 'Yoast\\WP\\SEO\\Builders\\Indexable_Builder' );
				$indexable = $repo->find_by_id_and_type( $post_id, 'post' );
				$builder->build_for_id_and_type( $post_id, 'post', $indexable );
			}
		} catch ( \Throwable $e ) {
			Logger::warning(
				'seo',
				'SEO-plugin bijwerken gaf een waarschuwing',
				array(
					'post'       => $post_id,
					'plugin'     => $plugin,
					'error_code' => get_class( $e ),
				)
			);
		}

		clean_post_cache( $post_id );
		return true;
	}

	/**
	 * AIOSEO-postmodel, indien beschikbaar.
	 *
	 * @param int $post_id Bericht-ID.
	 * @return object|null
	 */
	private static function aioseo_model( $post_id ) {
		$class = 'AIOSEO\\Plugin\\Common\\Models\\Post';
		if ( ! class_exists( $class ) ) {
			return null;
		}
		try {
			$model = call_user_func( array( $class, 'getPost' ), $post_id );
			return is_object( $model ) ? $model : null;
		} catch ( \Throwable $e ) {
			return null;
		}
	}
}
