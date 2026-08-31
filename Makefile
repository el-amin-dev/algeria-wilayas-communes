# Repo-level tasks for the Python package, plus the one setup step BOTH packages
# need.
#
# The JavaScript side is driven by pnpm scripts (see package.json); this file
# exists for the Python package, whose one piece of required local setup has no
# natural home in package.json -- and for `dev`, which now covers both, because
# packages/js/data/ is gitignored for exactly the same reason and
# tests/compat/cjs.test.ts needs it to prove the `./data/*` subpath resolves.

# Prefer the repo venv when one exists, so `make check` works straight after
# `python3 -m venv .venv && pip install -e "packages/python[dev]"` without
# needing the venv activated first. Override with `make PYTHON=... check`.
PYTHON ?= $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)
PKG    := packages/python

.PHONY: help dev test typecheck lint format check clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# Without this, a fresh checkout imports but cannot read a byte of data.
#
# packages/python/src/algeria_wilayas_communes/data/ is gitignored: the dataset
# is vendored into the package tree only at publish time, by
# .github/workflows/publish-pypi.yml. So a contributor who clones the repo and
# calls any accessor gets a FileNotFoundError, and nothing in the tree tells
# them a one-line symlink is all that is missing. _loader.py's error message
# names this target for the same reason.
#
# A SYMLINK, not a copy: edits to data/*.json are visible immediately and there
# is no second copy to drift out of sync with the 73-file published contract.
# The relative target resolves from
# packages/python/src/algeria_wilayas_communes/ back to the repo root.
dev: ## Link the dataset into both packages for local development
	ln -sfn ../../../../data $(PKG)/src/algeria_wilayas_communes/data
	@echo "linked data/ -> $(PKG)/src/algeria_wilayas_communes/data"
	ln -sfn ../../data packages/js/data
	@echo "linked data/ -> packages/js/data"
	@echo
	@echo "NOTE: this is a symlink, which is enough for the test suite but NOT"
	@echo "      for \`pnpm lint:publish\` or \`pnpm pack:check\` -- \`pnpm pack\` does not"
	@echo "      follow a symlinked directory, so publint reports"
	@echo "      'exports[\"./data/*\"] does not match any files'. Those two need a real"
	@echo "      copy, which CI and publish-npm.yml both make:"
	@echo "        rm -rf packages/js/data && cp -r data packages/js/data && rm -rf packages/js/data/raw"

test: ## Run the Python test suite
	$(PYTHON) -m pytest $(PKG) -q

typecheck: ## Type-check the Python package (mypy --strict)
	$(PYTHON) -m mypy $(PKG)/src

lint: ## Lint and check formatting of the Python package
	$(PYTHON) -m ruff check $(PKG)
	$(PYTHON) -m ruff format --check $(PKG)

format: ## Reformat the Python package in place
	$(PYTHON) -m ruff format $(PKG)
	$(PYTHON) -m ruff check --fix $(PKG)

# The same set CI runs, in the same order, so a green `make check` means a green
# `python` job rather than "probably fine".
check: test typecheck lint ## Run every Python gate

clean: ## Remove Python build and tool caches
	rm -rf $(PKG)/dist $(PKG)/build $(PKG)/src/*.egg-info
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	find $(PKG) -name '__pycache__' -type d -prune -exec rm -rf {} +
