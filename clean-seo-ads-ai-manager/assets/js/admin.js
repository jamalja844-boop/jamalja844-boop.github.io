/**
 * Clean SEO & Ads AI Manager — beheerinteracties.
 * Alle verzoeken gaan via wp.apiFetch (met wp_rest-nonce).
 */
( function () {
	'use strict';

	var cfg = window.csaamAdmin || {};
	var t = cfg.i18n || {};
	var api = window.wp && window.wp.apiFetch;
	if ( ! api ) {
		return;
	}

	function path( p ) {
		return '/' + cfg.ns + p;
	}

	function esc( s ) {
		var d = document.createElement( 'div' );
		d.textContent = s === undefined || s === null ? '' : String( s );
		return d.innerHTML;
	}

	function notice( el, type, html ) {
		if ( ! el ) {
			return;
		}
		el.innerHTML = '<div class="notice notice-' + type + ' inline"><p>' + html + '</p></div>';
	}

	function errorText( err ) {
		return esc( ( err && err.message ) || t.error );
	}

	function busy( btn, on ) {
		if ( ! btn ) {
			return;
		}
		if ( on ) {
			btn.dataset.label = btn.textContent;
			btn.textContent = t.working;
			btn.disabled = true;
		} else {
			btn.textContent = btn.dataset.label || btn.textContent;
			btn.disabled = false;
		}
	}

	function resultBox( btn ) {
		var card = btn.closest( '.csaam-card' );
		return card ? card.querySelector( '.csaam-result' ) : null;
	}

	// SEO-scan in batches.
	function scan( btn ) {
		var bar = document.querySelector( '.csaam-progress' );
		var prog = bar.querySelector( 'progress' );
		var label = bar.querySelector( 'span' );
		bar.hidden = false;
		busy( btn, true );
		label.textContent = t.scanning;
		function step( offset ) {
			api( { path: path( '/audit/scan' ), method: 'POST', data: { offset: offset, limit: 4 } } ).then( function ( res ) {
				var pct = res.total ? Math.round( res.done / res.total * 100 ) : 100;
				prog.value = pct;
				label.textContent = res.done + ' / ' + res.total;
				if ( res.done < res.total ) {
					step( res.done );
				} else {
					label.textContent = t.scanDone;
					window.location.reload();
				}
			} ).catch( function ( err ) {
				busy( btn, false );
				label.innerHTML = errorText( err );
			} );
		}
		step( 0 );
	}

	function pagespeed( btn ) {
		var card = btn.closest( '.csaam-card' );
		var out = card.querySelector( '.csaam-pagespeed-result' );
		busy( btn, true );
		out.innerHTML = '<p class="csaam-muted">' + esc( t.loading ) + '</p>';
		api( { path: path( '/pagespeed' ), method: 'POST', data: { post_id: parseInt( btn.dataset.post || '0', 10 ), strategy: btn.dataset.csaamPagespeed } } ).then( function ( r ) {
			busy( btn, false );
			var html = '<p><strong>' + esc( r.strategy === 'mobile' ? 'Mobiel' : 'Desktop' ) + ( r.demo ? ' (DEMO)' : '' ) + '</strong></p><ul class="csaam-checks">';
			Object.keys( r.scores ).forEach( function ( k ) {
				html += '<li>' + esc( k.replace( '_', ' ' ) ) + ': <strong>' + esc( r.scores[ k ] === null ? '—' : r.scores[ k ] ) + '</strong></li>';
			} );
			html += '</ul><p>LCP ' + esc( r.metrics.LCP ) + ' · CLS ' + esc( r.metrics.CLS ) + ' · TBT ' + esc( r.metrics.TBT ) + '</p>';
			if ( r.opportunities && r.opportunities.length ) {
				html += '<ul class="csaam-list">';
				r.opportunities.forEach( function ( o ) {
					html += '<li>' + esc( o.title ) + ( o.savings ? ' — ' + esc( o.savings ) : '' ) + '</li>';
				} );
				html += '</ul>';
			}
			out.innerHTML = html;
		} ).catch( function ( err ) {
			busy( btn, false );
			out.innerHTML = '<p>' + errorText( err ) + '</p>';
		} );
	}

	function inspect( btn ) {
		var out = document.querySelector( '.csaam-inspect-result' );
		busy( btn, true );
		api( { path: path( '/gsc/inspect' ), method: 'POST', data: { post_id: parseInt( btn.dataset.csaamInspect, 10 ) } } ).then( function ( r ) {
			busy( btn, false );
			out.hidden = false;
			out.innerHTML = '<dl class="csaam-dl"><dt>Oordeel</dt><dd>' + esc( r.verdict ) + '</dd><dt>Dekking</dt><dd>' + esc( r.coverage ) + '</dd><dt>Laatste crawl</dt><dd>' + esc( r.last_crawl ) + '</dd><dt>Canonical (Google)</dt><dd>' + esc( r.google_canonical ) + '</dd><dt>robots.txt</dt><dd>' + esc( r.robots ) + '</dd></dl>';
		} ).catch( function ( err ) {
			busy( btn, false );
			out.hidden = false;
			out.innerHTML = '<p>' + errorText( err ) + '</p>';
		} );
	}

	function generate( btn, task, postId ) {
		var box = resultBox( btn );
		busy( btn, true );
		notice( box, 'info', esc( t.aiWorking ) );
		api( { path: path( '/ai/generate' ), method: 'POST', data: { task: task, post_id: postId } } ).then( function ( r ) {
			window.location.href = 'admin.php?page=csaam-ai&proposal=' + encodeURIComponent( r.id );
		} ).catch( function ( err ) {
			busy( btn, false );
			if ( box ) {
				notice( box, 'error', errorText( err ) );
			} else {
				window.alert( ( err && err.message ) || t.error );
			}
		} );
	}

	// Review-scherm.
	var review = document.querySelector( '.csaam-review' );
	if ( review ) {
		var tabs = review.querySelectorAll( '.csaam-tabs [role="tab"]' );
		tabs.forEach( function ( tab ) {
			tab.addEventListener( 'click', function () {
				tabs.forEach( function ( x ) {
					x.setAttribute( 'aria-selected', x === tab ? 'true' : 'false' );
				} );
				review.querySelectorAll( '.csaam-tab' ).forEach( function ( p ) {
					p.hidden = p.dataset.panel !== tab.dataset.tab;
				} );
			} );
		} );

		var finalField = review.querySelector( '#csaam-final' );
		var counter = review.querySelector( '[data-csaam-count]' );
		var diffPanel = review.querySelector( '[data-panel="diff"]' );
		var timer = null;
		function updateCount() {
			if ( finalField && counter ) {
				counter.textContent = finalField.value.length + ' tekens';
			}
		}
		function refreshDiff() {
			if ( ! finalField ) {
				return;
			}
			clearTimeout( timer );
			timer = setTimeout( function () {
				api( { path: path( '/ai/diff' ), method: 'POST', data: { id: parseInt( review.dataset.proposal, 10 ), value: finalField.value } } ).then( function ( r ) {
					diffPanel.innerHTML = '<div class="csaam-diff">' + r.diff + '</div>';
				} ).catch( function () {} );
			}, 400 );
		}
		if ( finalField ) {
			updateCount();
			finalField.addEventListener( 'input', function () {
				updateCount();
				refreshDiff();
			} );
		}
		review.querySelectorAll( 'input[name="csaam-option"]' ).forEach( function ( radio ) {
			radio.addEventListener( 'change', function () {
				if ( finalField ) {
					finalField.value = radio.value;
					updateCount();
					refreshDiff();
				}
			} );
		} );

		review.querySelectorAll( '[data-csaam-decide]' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				var decision = btn.dataset.csaamDecide;
				var field = review.dataset.field;
				if ( decision === 'approve' && ! window.confirm( field === 'content' ? t.confirmDraft : t.confirm ) ) {
					return;
				}
				var box = review.querySelector( '.csaam-result' );
				busy( btn, true );
				api( {
					path: path( '/ai/proposals/' + review.dataset.proposal + '/decide' ),
					method: 'POST',
					data: { decision: decision, value: finalField ? finalField.value : '' },
				} ).then( function ( r ) {
					var html = esc( r.message );
					if ( r.edit_url ) {
						html += ' <a class="button" href="' + esc( r.edit_url ) + '">' + esc( t.openDraft ) + '</a>';
					}
					notice( box, decision === 'approve' ? 'success' : 'warning', html );
					review.querySelectorAll( '[data-csaam-decide]' ).forEach( function ( b ) {
						b.disabled = true;
					} );
				} ).catch( function ( err ) {
					busy( btn, false );
					notice( box, 'error', errorText( err ) );
				} );
			} );
		} );
	}

	function googleOptions( btn ) {
		var out = document.querySelector( '.csaam-google-options-result' );
		busy( btn, true );
		api( { path: path( '/google/options' ) } ).then( function ( r ) {
			busy( btn, false );
			function fill( id, values ) {
				var list = document.getElementById( id );
				if ( ! list ) {
					return;
				}
				list.innerHTML = '';
				values.forEach( function ( v ) {
					var o = document.createElement( 'option' );
					o.value = v[ 0 ];
					o.label = v[ 1 ];
					list.appendChild( o );
				} );
			}
			fill( 'csaam-list-gsc_site_url', r.sites.map( function ( s ) {
				return [ s, s ];
			} ) );
			fill( 'csaam-list-ga4_property_id', Object.keys( r.properties ).map( function ( k ) {
				return [ k, r.properties[ k ] ];
			} ) );
			fill( 'csaam-list-ads_customer_id', r.customers.map( function ( c ) {
				return [ c, c ];
			} ) );
			var parts = [];
			parts.push( 'Search Console: ' + ( r.sites_err ? esc( r.sites_err ) : r.sites.length + ' properties' ) );
			parts.push( 'GA4: ' + ( r.props_err ? esc( r.props_err ) : Object.keys( r.properties ).length + ' properties' ) );
			parts.push( 'Google Ads: ' + ( r.ads_err ? esc( r.ads_err ) : r.customers.length + ' accounts' ) );
			notice( out, r.sites_err || r.props_err || r.ads_err ? 'warning' : 'success', parts.join( '<br>' ) + '<br>Klik in een veld hieronder om een waarde te kiezen.' );
		} ).catch( function ( err ) {
			busy( btn, false );
			notice( out, 'error', errorText( err ) );
		} );
	}

	document.addEventListener( 'click', function ( ev ) {
		var btn = ev.target.closest( 'button, a' );
		if ( ! btn || ! btn.closest( '.csaam' ) ) {
			return;
		}
		if ( btn.hasAttribute( 'data-csaam-scan' ) ) {
			ev.preventDefault();
			scan( btn );
		} else if ( btn.hasAttribute( 'data-csaam-rescan' ) ) {
			ev.preventDefault();
			busy( btn, true );
			api( { path: path( '/audit/page/' + btn.dataset.csaamRescan ), method: 'POST' } ).then( function () {
				window.location.reload();
			} ).catch( function ( err ) {
				busy( btn, false );
				window.alert( ( err && err.message ) || t.error );
			} );
		} else if ( btn.hasAttribute( 'data-csaam-pagespeed' ) ) {
			ev.preventDefault();
			pagespeed( btn );
		} else if ( btn.hasAttribute( 'data-csaam-inspect' ) ) {
			ev.preventDefault();
			inspect( btn );
		} else if ( btn.hasAttribute( 'data-csaam-ai' ) ) {
			ev.preventDefault();
			generate( btn, btn.dataset.csaamAi, parseInt( btn.dataset.post || '0', 10 ) );
		} else if ( btn.hasAttribute( 'data-csaam-ai-form' ) ) {
			ev.preventDefault();
			var postId = parseInt( document.getElementById( 'csaam-ai-post' ).value, 10 );
			if ( ! postId || postId < 1 ) {
				notice( resultBox( btn ), 'warning', 'Kies eerst een pagina.' );
				return;
			}
			generate( btn, document.getElementById( 'csaam-ai-task' ).value, postId );
		} else if ( btn.hasAttribute( 'data-csaam-google-options' ) ) {
			ev.preventDefault();
			googleOptions( btn );
		}
	} );

	// Onthoud de sectie bij opslaan van instellingen.
	var form = document.querySelector( '.csaam-settings-form' );
	if ( form ) {
		form.addEventListener( 'submit', function () {
			var tab = form.querySelector( 'input[name="csaam_tab"]' );
			if ( tab ) {
				tab.value = ( window.location.hash || '' ).replace( '#', '' );
			}
		} );
	}
}() );
