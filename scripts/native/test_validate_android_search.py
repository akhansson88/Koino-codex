import hashlib
import importlib.util
import io
import pathlib
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "validate_android_search", pathlib.Path(__file__).with_name("validate-android-search.py"))
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class BundledSearchAssetsTest(unittest.TestCase):
    def setUp(self):
        self.payloads = {"model": b"onnx" * 300000, "tokenizer": b"vocabulary",
                         "tokenizerConfig": b'{"max_length":512}', "database": b"SQLite search index"}
        self.manifest = {"assets": {role: {"file": f"source-{role}", "bytes": len(contents),
            "sha256": hashlib.sha256(contents).hexdigest()} for role, contents in self.payloads.items()}}

    def archive(self, corrupt=None, missing=None):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for i, (role, contents) in enumerate(self.payloads.items()):
                if role == missing:
                    continue
                if role == corrupt:
                    contents = bytes([contents[0] ^ 1]) + contents[1:]
                archive.writestr(f"res/raw/renamed_asset_{i}.bin", contents)
        output.seek(0)
        return zipfile.ZipFile(output)

    def test_finds_all_four_assets_when_packager_renames_and_compresses_them(self):
        with self.archive() as archive:
            # Large assets must be streamed, never read as a single archive.read().
            archive.read = lambda *_args, **_kwargs: self.fail("Asset verification must stream")
            assets, failures = validator.bundled_asset_matches(archive, self.manifest)
        self.assertEqual(failures, [])
        self.assertEqual(len(assets), 4)
        self.assertTrue(all(len(asset["apkEntries"]) == 1 for asset in assets))

    def test_rejects_corruption_even_when_uncompressed_size_matches(self):
        with self.archive(corrupt="model") as archive:
            assets, failures = validator.bundled_asset_matches(archive, self.manifest)
        self.assertEqual(len(failures), 1)
        self.assertIn("model", failures[0])
        self.assertFalse(next(asset for asset in assets if asset["role"] == "model")["apkEntries"])

    def test_rejects_missing_database_and_invalid_descriptor(self):
        self.manifest["assets"]["tokenizer"]["sha256"] = "invalid"
        with self.archive(missing="database") as archive:
            _, failures = validator.bundled_asset_matches(archive, self.manifest)
        self.assertEqual(len(failures), 2)
        self.assertTrue(any("database" in failure for failure in failures))
        self.assertTrue(any("tokenizer" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
