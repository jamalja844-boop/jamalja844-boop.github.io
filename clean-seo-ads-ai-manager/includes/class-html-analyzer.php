<?php
/**
 * Analyseert de HTML van een pagina zoals Google die ziet.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM-eigenschappen van PHP zelf.

/**
 * Html_Analyzer.
 */
class Html_Analyzer {

	const MINHASH_SIZE = 48;

	/**
	 * Extraheert SEO-relevante gegevens uit HTML.
	 *
	 * @param string $html     Volledige HTML.
	 * @param string $page_url URL van de pagina (voor intern/extern).
	 * @return array
	 */
	public static function analyze( $html, $page_url ) {
		$doc   = new \DOMDocument();
		$prev  = libxml_use_internal_errors( true );
		$saved = $doc->loadHTML( '<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_COMPACT );
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );

		$out = array(
			'title'        => '',
			'titles'       => 0,
			'description'  => '',
			'descriptions' => 0,
			'robots'       => '',
			'canonicals'   => array(),
			'viewport'     => false,
			'lang'         => '',
			'headings'     => array(),
			'links'        => array(
				'internal'      => 0,
				'external'      => 0,
				'nofollow'      => 0,
				'internal_urls' => array(),
			),
			'images'       => array(
				'total'           => 0,
				'missing_alt'     => 0,
				'empty_alt'       => 0,
				'no_dimensions'   => 0,
				'missing_alt_src' => array(),
			),
			'schema'       => array(
				'blocks'  => 0,
				'invalid' => 0,
				'types'   => array(),
			),
			'og'           => false,
			'text'         => '',
			'word_count'   => 0,
		);
		if ( ! $saved ) {
			return $out;
		}
		$xpath = new \DOMXPath( $doc );

		$html_el = $doc->getElementsByTagName( 'html' )->item( 0 );
		if ( $html_el ) {
			$out['lang'] = strtolower( (string) $html_el->getAttribute( 'lang' ) );
		}

		$titles        = $xpath->query( '//head/title' );
		$out['titles'] = $titles->length;
		if ( $titles->length ) {
			$out['title'] = self::clean( $titles->item( 0 )->textContent );
		}

		foreach ( $xpath->query( '//meta' ) as $meta ) {
			$name    = strtolower( $meta->getAttribute( 'name' ) );
			$prop    = strtolower( $meta->getAttribute( 'property' ) );
			$content = self::clean( $meta->getAttribute( 'content' ) );
			if ( 'description' === $name ) {
				++$out['descriptions'];
				if ( '' === $out['description'] ) {
					$out['description'] = $content;
				}
			} elseif ( 'robots' === $name || 'googlebot' === $name ) {
				$out['robots'] = trim( $out['robots'] . ',' . strtolower( $content ), ',' );
			} elseif ( 'viewport' === $name ) {
				$out['viewport'] = true;
			} elseif ( 'og:title' === $prop ) {
				$out['og'] = true;
			}
		}

		foreach ( $xpath->query( '//link[@rel]' ) as $link ) {
			if ( 'canonical' === strtolower( trim( $link->getAttribute( 'rel' ) ) ) ) {
				$out['canonicals'][] = trim( $link->getAttribute( 'href' ) );
			}
		}

		foreach ( $xpath->query( '//script[@type="application/ld+json"]' ) as $script ) {
			++$out['schema']['blocks'];
			$json = json_decode( trim( $script->textContent ), true );
			if ( ! is_array( $json ) ) {
				++$out['schema']['invalid'];
				continue;
			}
			$out['schema']['types'] = array_merge( $out['schema']['types'], self::schema_types( $json ) );
		}
		$out['schema']['types'] = array_values( array_unique( $out['schema']['types'] ) );

		// Hoofdinhoud: <main>, anders <article>, anders <body> zonder navigatie.
		$main = $xpath->query( '//main' )->item( 0 );
		if ( ! $main ) {
			$main = $xpath->query( '//article' )->item( 0 );
		}
		if ( ! $main ) {
			$main = $doc->getElementsByTagName( 'body' )->item( 0 );
		}
		if ( ! $main ) {
			return $out;
		}

		foreach ( $xpath->query( './/h1|.//h2|.//h3|.//h4|.//h5|.//h6', $doc->getElementsByTagName( 'body' )->item( 0 ) ? $doc->getElementsByTagName( 'body' )->item( 0 ) : $main ) as $h ) {
			$out['headings'][] = array(
				'level' => (int) substr( strtolower( $h->nodeName ), 1 ),
				'text'  => mb_substr( self::clean( $h->textContent ), 0, 200 ),
			);
		}

		$host = wp_parse_url( $page_url, PHP_URL_HOST );
		foreach ( $xpath->query( './/a[@href]', $main ) as $a ) {
			if ( self::inside( $a, array( 'nav', 'header', 'footer' ) ) ) {
				continue;
			}
			$href = trim( $a->getAttribute( 'href' ) );
			if ( '' === $href || '#' === $href[0] || preg_match( '/^(mailto|tel|javascript|whatsapp):/i', $href ) ) {
				continue;
			}
			$link_host = wp_parse_url( $href, PHP_URL_HOST );
			if ( ! $link_host || strtolower( $link_host ) === strtolower( (string) $host ) ) {
				++$out['links']['internal'];
				if ( count( $out['links']['internal_urls'] ) < 100 ) {
					$out['links']['internal_urls'][] = $href;
				}
			} else {
				++$out['links']['external'];
			}
			if ( false !== stripos( $a->getAttribute( 'rel' ), 'nofollow' ) ) {
				++$out['links']['nofollow'];
			}
		}

		foreach ( $xpath->query( './/img', $main ) as $img ) {
			++$out['images']['total'];
			if ( ! $img->hasAttribute( 'alt' ) ) {
				++$out['images']['missing_alt'];
				if ( count( $out['images']['missing_alt_src'] ) < 10 ) {
					$out['images']['missing_alt_src'][] = esc_url_raw( $img->getAttribute( 'src' ) );
				}
			} elseif ( '' === trim( $img->getAttribute( 'alt' ) ) ) {
				++$out['images']['empty_alt'];
			}
			if ( ! $img->hasAttribute( 'width' ) || ! $img->hasAttribute( 'height' ) ) {
				++$out['images']['no_dimensions'];
			}
		}

		// Tekst zonder scripts, styles, navigatie en footer.
		$clone = $main->cloneNode( true );
		$cx    = new \DOMXPath( $doc );
		$kill  = array();
		foreach ( $cx->query( './/script|.//style|.//noscript|.//nav|.//header|.//footer|.//form|.//svg', $clone ) as $node ) {
			$kill[] = $node;
		}
		foreach ( $kill as $node ) {
			if ( $node->parentNode ) {
				$node->parentNode->removeChild( $node );
			}
		}
		$text              = self::clean( $clone->textContent );
		$out['text']       = mb_substr( $text, 0, 60000 );
		$out['word_count'] = self::word_count( $text );

		return $out;
	}

	/**
	 * Verzamelt @type-waarden (inclusief @graph).
	 *
	 * @param array $json JSON-LD.
	 * @return string[]
	 */
	private static function schema_types( array $json ) {
		$types = array();
		$items = isset( $json['@graph'] ) && is_array( $json['@graph'] ) ? $json['@graph'] : ( isset( $json[0] ) ? $json : array( $json ) );
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || ! isset( $item['@type'] ) ) {
				continue;
			}
			foreach ( (array) $item['@type'] as $type ) {
				$types[] = (string) $type;
			}
		}
		return $types;
	}

	/**
	 * Ligt een node binnen een van de opgegeven elementen?
	 *
	 * @param \DOMNode $node Node.
	 * @param string[] $tags Tags.
	 * @return bool
	 */
	private static function inside( $node, array $tags ) {
		for ( $p = $node->parentNode; $p; $p = $p->parentNode ) {
			if ( in_array( strtolower( $p->nodeName ), $tags, true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Witruimte normaliseren.
	 *
	 * @param string $text Tekst.
	 * @return string
	 */
	public static function clean( $text ) {
		$text = html_entity_decode( (string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		return trim( preg_replace( '/\s+/u', ' ', $text ) );
	}

	/**
	 * Woorden tellen (unicode).
	 *
	 * @param string $text Tekst.
	 * @return int
	 */
	public static function word_count( $text ) {
		return (int) preg_match_all( '/[\p{L}\p{N}][\p{L}\p{N}\'\-]*/u', (string) $text );
	}

	/**
	 * MinHash-handtekening van een tekst (3-woord-shingles). Plaatsnamen
	 * worden vervangen door één token, zodat sjabloonpagina's waarin alleen
	 * de plaatsnaam verschilt als (bijna) dubbel worden herkend.
	 *
	 * @param string   $text   Tekst.
	 * @param string[] $cities Plaatsnamen.
	 * @return int[]
	 */
	public static function minhash( $text, array $cities = array() ) {
		$text = mb_strtolower( (string) $text );
		foreach ( $cities as $city ) {
			$city = trim( mb_strtolower( (string) $city ) );
			if ( '' !== $city ) {
				$text = preg_replace( '/(?<![\p{L}\p{N}])' . preg_quote( $city, '/' ) . '(?![\p{L}\p{N}])/u', ' plaatsnaam ', $text );
			}
		}
		preg_match_all( '/[\p{L}\p{N}]+/u', $text, $m );
		$words = $m[0];
		$count = count( $words );
		if ( $count < 3 ) {
			return array();
		}
		$shingles = array();
		for ( $i = 0; $i < $count - 2; $i++ ) {
			$shingles[ $words[ $i ] . ' ' . $words[ $i + 1 ] . ' ' . $words[ $i + 2 ] ] = true;
		}
		$sig = array_fill( 0, self::MINHASH_SIZE, PHP_INT_MAX );
		foreach ( array_keys( $shingles ) as $shingle ) {
			for ( $k = 0; $k < self::MINHASH_SIZE; $k++ ) {
				$h = crc32( $k . '|' . $shingle );
				if ( $h < $sig[ $k ] ) {
					$sig[ $k ] = $h;
				}
			}
		}
		return $sig;
	}

	/**
	 * Geschatte Jaccard-gelijkenis (0..1) tussen twee MinHash-handtekeningen.
	 *
	 * @param int[] $a Handtekening A.
	 * @param int[] $b Handtekening B.
	 * @return float
	 */
	public static function similarity( array $a, array $b ) {
		if ( count( $a ) !== self::MINHASH_SIZE || count( $b ) !== self::MINHASH_SIZE ) {
			return 0.0;
		}
		$same = 0;
		for ( $k = 0; $k < self::MINHASH_SIZE; $k++ ) {
			if ( $a[ $k ] === $b[ $k ] ) {
				++$same;
			}
		}
		return $same / self::MINHASH_SIZE;
	}
}
