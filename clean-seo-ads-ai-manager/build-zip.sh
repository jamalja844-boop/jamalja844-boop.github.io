#!/usr/bin/env bash
# Bouwt dist/clean-seo-ads-ai-manager.zip (zonder ontwikkelbestanden).
set -euo pipefail
cd "$(dirname "$0")"
OUT="../dist"
mkdir -p "$OUT"
rm -f "$OUT/clean-seo-ads-ai-manager.zip"
cd ..
zip -rq "dist/clean-seo-ads-ai-manager.zip" clean-seo-ads-ai-manager \
	-x 'clean-seo-ads-ai-manager/build-zip.sh' \
	-x 'clean-seo-ads-ai-manager/phpcs.xml.dist' \
	-x 'clean-seo-ads-ai-manager/.*' \
	-x '*/.DS_Store'
echo "Gemaakt: $(pwd)/dist/clean-seo-ads-ai-manager.zip"
