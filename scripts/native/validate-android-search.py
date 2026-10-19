"""Check that an Android APK contains the local AI engine and 16 KB-safe ELF files."""
import argparse
import hashlib
import json
import pathlib
import re
import struct
import zipfile


def elf_load_alignments(contents):
    if contents[:4] != b"\x7fELF":
        raise ValueError("Native library is not an ELF file")
    byte_order = "<" if contents[5] == 1 else ">"
    if contents[4] == 2:
        phoff = struct.unpack_from(byte_order + "Q", contents, 32)[0]
        phsize, phcount = struct.unpack_from(byte_order + "HH", contents, 54)
        alignment_offset, alignment_type = 48, "Q"
    elif contents[4] == 1:
        phoff = struct.unpack_from(byte_order + "I", contents, 28)[0]
        phsize, phcount = struct.unpack_from(byte_order + "HH", contents, 42)
        alignment_offset, alignment_type = 28, "I"
    else:
        raise ValueError("Unknown ELF class")
    return [
        struct.unpack_from(byte_order + alignment_type, contents, phoff + i * phsize + alignment_offset)[0]
        for i in range(phcount)
        if struct.unpack_from(byte_order + "I", contents, phoff + i * phsize)[0] == 1
    ]


def bundled_asset_matches(archive, manifest):
    """Find content-addressed Expo assets without relying on their APK filenames."""
    by_size = {}
    for entry in archive.infolist():
        if not entry.is_dir():
            by_size.setdefault(entry.file_size, []).append(entry)
    digests, assets, failures = {}, [], []
    for role in ("model", "tokenizer", "tokenizerConfig", "database"):
        descriptor = manifest.get("assets", {}).get(role, {})
        size = descriptor.get("bytes")
        expected_hash = descriptor.get("sha256", "")
        if (
            type(size) is not int or size <= 0 or not isinstance(expected_hash, str)
            or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash)
            or not isinstance(descriptor.get("file"), str)
        ):
            failures.append(f"Required bundled asset has an invalid manifest descriptor: {role}")
            continue
        matches = []
        for entry in by_size.get(size, []):
            if entry.header_offset not in digests:
                digest = hashlib.sha256()
                with archive.open(entry) as contents:
                    for chunk in iter(lambda: contents.read(1024 * 1024), b""):
                        digest.update(chunk)
                digests[entry.header_offset] = digest.hexdigest()
            if digests[entry.header_offset] == expected_hash.lower():
                matches.append(entry.filename)
        if not matches:
            failures.append(f"Required bundled asset is missing or does not match its size/SHA-256: {role}")
        assets.append({"role": role, "file": descriptor["file"], "bytes": size,
                       "sha256": expected_hash.lower(), "apkEntries": matches})
    return assets, failures


def validate(apk_path, abi, manifest_path=None):
    required = {"vec.so", "libonnxruntime.so", "libonnxruntimejsi.so"}
    libraries, failures, assets = [], [], []
    with zipfile.ZipFile(apk_path) as archive, open(apk_path, "rb") as apk:
        for entry in archive.infolist():
            if not entry.filename.startswith(f"lib/{abi}/") or not entry.filename.endswith(".so"):
                continue
            name = pathlib.PurePosixPath(entry.filename).name
            required.discard(name)
            alignments = elf_load_alignments(archive.read(entry))
            if not alignments or min(alignments) < 16384:
                failures.append(f"{name}: ELF LOAD alignment is below 16 KB")
            if entry.compress_type == zipfile.ZIP_STORED:
                apk.seek(entry.header_offset + 26)
                name_length, extra_length = struct.unpack("<HH", apk.read(4))
                data_offset = entry.header_offset + 30 + name_length + extra_length
                if data_offset % 16384:
                    failures.append(f"{name}: uncompressed APK entry is not 16 KB-aligned")
            libraries.append({"file": name, "loadAlignment": min(alignments) if alignments else 0})
        if manifest_path is not None:
            manifest = json.loads(pathlib.Path(manifest_path).read_text(encoding="utf8"))
            assets, asset_failures = bundled_asset_matches(archive, manifest)
            failures.extend(asset_failures)
    failures.extend(f"Required AI search library is missing: {name}" for name in sorted(required))
    report = {"apk": str(apk_path), "abi": abi, "libraries": libraries, "failures": failures}
    if manifest_path is not None:
        report.update(manifest=str(manifest_path), bundledAssets=assets)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=pathlib.Path)
    parser.add_argument("--abi", default="arm64-v8a")
    parser.add_argument("--manifest", type=pathlib.Path,
                        help="Also verify all four bundled search assets against this manifest")
    options = parser.parse_args()
    report = validate(options.apk, options.abi, options.manifest)
    print(json.dumps(report, indent=2))
    raise SystemExit(1 if report["failures"] else 0)
