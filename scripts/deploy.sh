#!/bin/sh
# Bygger appen og publiserer dist/ til gh-pages-grenen (GitHub Pages).
set -e
cd "$(dirname "$0")/.."
npm test
npm run build
touch dist/.nojekyll
REMOTE=$(git remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Tekstbok deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "Publiser $(date '+%Y-%m-%d %H:%M')"
git -c credential.helper= -c credential.helper="!gh auth git-credential" push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Publisert. Siden oppdateres om et minutt."
