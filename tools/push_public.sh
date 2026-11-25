#!/usr/bin/env bash
# Publish the code to GitHub without any of the client's art: clone this repo, drop the generated asset folders from every
# commit (the first commits still contained map sprites), graft the result on top of the remote's first commit, push main.
# filter-branch keeps dates and the graft parent never changes, so hashes are identical on every run: plain fast-forward
# pushes, never a force push.        tools/push_public.sh [remote]
set -e
REMOTE=${1:-https://github.com/Ourselp/ProjectXII.git}
B=$(git rev-parse --abbrev-ref HEAD)                         # local branch (master) -> remote main
T=$(mktemp -d)
git clone -q --no-local . "$T/repo"
cd "$T/repo"
git fetch -q "$REMOTE" main:remote-main
ROOT=$(git rev-list --max-parents=0 remote-main | tail -1)   # the remote's initial commit (README)
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch \
  --index-filter 'git rm -r -q --cached --ignore-unmatch public/gfx public/maps public/char public/rigs public/skins public/audio public/data public/ui public/worldmap' \
  --parent-filter "read p; [ -z \"\$p\" ] && echo \"-p $ROOT\" || echo \"\$p\"" -- "$B"
git push "$REMOTE" "$B:main"
cd - >/dev/null && rm -rf "$T"
