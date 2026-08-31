#!/usr/bin/env bash
#
# Provisions everything `npm test` needs on a machine that has none of it.
#
# The remote dev containers are reclaimed after a period of inactivity and come
# back from a snapshot, so anything installed at runtime -- node_modules, the
# ti_asm_mcp checkout, the VS Code test build, CCS -- is gone on the next
# session while the repo itself looks untouched. Rebuilding that by hand costs
# the better part of an hour, most of it waiting on two large downloads.
#
# Every step checks before it acts, so this is safe to re-run: on a fully
# provisioned machine it does nothing but print what it found.
#
#   src/test/provision.sh              install whatever is missing
#   src/test/provision.sh --check      report only, exit 1 if anything is missing
#   src/test/provision.sh --keep-downloads   leave the installers on disk
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOWNLOADS="${TMPDIR:-/tmp}/c2000-idea-provision"

# Pinned rather than "latest": test-env.json points at .../ccs2100, which is
# this exact release. A newer CCS installs beside it under a different name and
# the tests would still find nothing.
CCS_VERSION="${CCS_VERSION:-21.0.0.00014}"
CCS_URL_BASE="https://dr-download.ti.com/software-development/ide-configuration-compiler-or-debugger/MD-J1VdearkvK"

# Only the C2000 device family. The default is every family TI ships and costs
# several GB more for parts nothing here compiles.
CCS_COMPONENTS="${CCS_COMPONENTS:-PF_C28}"

CHECK_ONLY=0
KEEP_DOWNLOADS=0
for arg in "$@"; do
	case "$arg" in
		--check) CHECK_ONLY=1 ;;
		--keep-downloads) KEEP_DOWNLOADS=1 ;;
		-h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

MISSING=0

say()  { printf '\n== %s\n' "$*"; }
ok()   { printf '   ok      %s\n' "$*"; }
todo() { printf '   MISSING %s\n' "$*"; MISSING=1; }
warn() { printf '   warning %s\n' "$*"; }

# In --check mode every step reports and none of them install.
acting() { [ "$CHECK_ONLY" -eq 0 ]; }

# Both large downloads have failed mid-transfer here often enough to matter, and
# a truncated file is worse than no file: the unzip error it produces points at
# the archive rather than at the network. Resume until the size on disk matches
# what the server advertised.
fetch() {
	local url="$1" out="$2" expected="$3" attempt have
	mkdir -p "$(dirname "$out")"
	for attempt in $(seq 1 60); do
		have=$(stat -c %s "$out" 2>/dev/null || echo 0)
		if [ "$have" -ge "$expected" ]; then return 0; fi
		printf '   fetch attempt %s: %s / %s bytes\n' "$attempt" "$have" "$expected"
		curl -fsSL -C - --retry 5 --retry-all-errors --retry-delay 3 -o "$out" "$url" || true
	done
	echo "failed to download $url" >&2
	return 1
}

content_length() {
	curl -fsSI -L --max-time 60 "$1" | tr -d '\r' \
		| awk 'tolower($1) == "content-length:" { n = $2 } END { print n }'
}

# ---------------------------------------------------------------- platform ---
say "platform"
if [ "$(uname -s)" != "Linux" ]; then
	echo "   this script installs the linux-x64 builds only; on $(uname -s) install CCS and VS Code by hand" >&2
	exit 2
fi
ok "$(uname -s) $(uname -m)"

# ------------------------------------------------------------ node_modules ---
say "node_modules"
if [ -d "$REPO_ROOT/node_modules" ]; then
	ok "$REPO_ROOT/node_modules"
else
	todo "node_modules"
	if acting; then
		( cd "$REPO_ROOT" && npm install )
		ok "installed"
	fi
fi

# --------------------------------------------------------------- submodule ---
# tsc resolves src/mcp/ti-asm-mcp.ts against submodules/ti_asm_mcp/src, so an
# uninitialised submodule fails the build with "cannot find module" rather than
# anything that names the submodule.
say "ti_asm_mcp submodule"
SUBMODULE="$REPO_ROOT/submodules/ti_asm_mcp"
if [ -f "$SUBMODULE/package.json" ]; then
	ok "$SUBMODULE"
else
	todo "submodules/ti_asm_mcp (not checked out)"
	if acting; then
		( cd "$REPO_ROOT" && git submodule update --init --recursive )
		ok "checked out"
	fi
fi
if [ -f "$SUBMODULE/package.json" ]; then
	if [ -d "$SUBMODULE/node_modules" ]; then
		ok "submodule node_modules"
	else
		todo "submodule node_modules"
		if acting; then
			( cd "$SUBMODULE" && npm install )
			ok "installed"
		fi
	fi
fi

# ----------------------------------------------------------------- VS Code ---
# runTest.ts reuses any build under .vscode-test that has the binary, newest
# first, so the version does not have to match anything -- it only has to exist.
# @vscode/test-electron's own download does not resume, and at ~350 MB it has
# reset at 90%+ here more than once.
say "VS Code test build"
VSCODE_CACHE="$REPO_ROOT/.vscode-test"
if compgen -G "$VSCODE_CACHE/vscode-*/code" > /dev/null; then
	ok "$(dirname "$(compgen -G "$VSCODE_CACHE/vscode-*/code" | head -1)")"
else
	todo ".vscode-test (no cached build)"
	if acting; then
		url="https://update.code.visualstudio.com/latest/linux-x64/stable"
		size=$(content_length "$url")
		[ -n "$size" ] || { echo "could not determine VS Code download size" >&2; exit 1; }
		fetch "$url" "$DOWNLOADS/vscode.tar.gz" "$size"

		staging="$DOWNLOADS/vscode-extract"
		rm -rf "$staging" && mkdir -p "$staging"
		tar -xzf "$DOWNLOADS/vscode.tar.gz" -C "$staging" --strip-components=1

		# Name the directory the way @vscode/test-electron would, so a later run
		# of the real downloader treats it as its own cache entry.
		version=$(node -p "require('$staging/resources/app/package.json').version")
		mkdir -p "$VSCODE_CACHE"
		rm -rf "$VSCODE_CACHE/vscode-linux-x64-$version"
		mv "$staging" "$VSCODE_CACHE/vscode-linux-x64-$version"
		ok "installed $version"
	fi
fi

# --------------------------------------------------------------------- CCS ---
# The path comes from the same config the tests read, so this cannot install to
# somewhere resolveTestEnv() will not look.
say "Code Composer Studio"
CCS_DIR=$(node -e '
	const fs = require("fs"), path = require("path");
	const read = n => { try { return JSON.parse(fs.readFileSync(path.join(process.argv[1], n), "utf8")); } catch { return {}; } };
	process.stdout.write(read("test-env.local.json").ccs ?? read("test-env.json").ccs ?? "");
' "$REPO_ROOT")

if [ -z "$CCS_DIR" ]; then
	warn 'no "ccs" in test-env.json or test-env.local.json -- skipping'
elif [ -x "$CCS_DIR/eclipse/ccs-server-cli.sh" ]; then
	ok "$CCS_DIR"
else
	todo "$CCS_DIR (no eclipse/ccs-server-cli.sh)"
	if acting; then
		[ "$(id -u)" -eq 0 ] || { echo "   CCS install needs root (writes $CCS_DIR and /etc)" >&2; exit 1; }

		# TI's Blackhawk JTAG emupack runs a post-install driver script, and when
		# it fails the whole CCS install aborts and rolls back -- with the real
		# reason four levels deep in install_logs. In a container it fails twice:
		# no /etc/udev/rules.d to copy the rule into, then no /etc/init.d/udev
		# for the `service udev restart` that follows. Nothing here uses a JTAG
		# probe, so both can be satisfied with an empty directory and a no-op.
		mkdir -p /etc/udev/rules.d
		if [ ! -e /etc/init.d/udev ]; then
			cat > /etc/init.d/udev <<'UDEV_EOF'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          udev
# Required-Start:
# Required-Stop:
# Default-Start:     S
# Default-Stop:
# Short-Description: no-op udev shim for containers with no init system
### END INIT INFO
exit 0
UDEV_EOF
			chmod +x /etc/init.d/udev
			ok "added /etc/init.d/udev shim"
		fi

		zip="$DOWNLOADS/CCS_${CCS_VERSION}_linux.zip"
		url="$CCS_URL_BASE/${CCS_VERSION%.*}/CCS_${CCS_VERSION}_linux.zip"
		size=$(content_length "$url")
		[ -n "$size" ] || { echo "could not reach $url" >&2; exit 1; }
		fetch "$url" "$zip" "$size"

		unpack="$DOWNLOADS/ccs-installer"
		rm -rf "$unpack" && mkdir -p "$unpack"
		unzip -q -o "$zip" -d "$unpack"
		setup=$(find "$unpack" -name 'ccs_setup_*.run' | head -1)
		[ -n "$setup" ] || { echo "no ccs_setup_*.run in $zip" >&2; exit 1; }
		chmod +x "$setup"

		# --prefix is the parent: the installer appends its own ccs/ directory,
		# which is what test-env.json points at.
		"$setup" --mode unattended --prefix "$(dirname "$CCS_DIR")" \
			--enable-components "$CCS_COMPONENTS" || true

		if [ -x "$CCS_DIR/eclipse/ccs-server-cli.sh" ]; then
			ok "installed $CCS_VERSION"
		else
			echo "   CCS install failed; last log lines:" >&2
			log=$(ls -d "$CCS_DIR"/install_logs/*/ 2>/dev/null | tail -1 || true)
			[ -n "$log" ] && tail -20 "$log"/ccs_install_*.log >&2 || true
			exit 1
		fi
	fi
fi

# --------------------------------------------------------------- C2000Ware ---
# A sibling clone rather than something installable, so this only reports.
say "C2000Ware"
C2000WARE_DIR=$(node -e '
	const fs = require("fs"), path = require("path");
	const read = n => { try { return JSON.parse(fs.readFileSync(path.join(process.argv[1], n), "utf8")); } catch { return {}; } };
	process.stdout.write(read("test-env.local.json").c2000ware ?? read("test-env.json").c2000ware ?? "");
' "$REPO_ROOT")

if [ -z "$C2000WARE_DIR" ]; then
	warn 'no "c2000ware" in test-env.json or test-env.local.json'
elif [ -f "$C2000WARE_DIR/.metadata/sdk.json" ]; then
	ok "$C2000WARE_DIR"
else
	todo "$C2000WARE_DIR (no .metadata/sdk.json)"
	warn "clone c2000ware-core-sdk there, or point \"c2000ware\" at it in test-env.local.json"
fi

# ------------------------------------------------------------------ finish ---
if [ "$CHECK_ONLY" -eq 1 ]; then
	say "check only -- nothing installed"
	exit "$MISSING"
fi

if [ "$KEEP_DOWNLOADS" -eq 0 ]; then
	rm -rf "$DOWNLOADS"
else
	say "downloads kept in $DOWNLOADS"
fi

say "ready -- run: DISPLAY=\${DISPLAY:-:95} npm test"
