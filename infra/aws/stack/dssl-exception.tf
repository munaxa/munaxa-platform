# TEMPORARY: owner decision D-SSL (22 Nov 2026), Testing-only acceptance of the OpenSSL 3.5.9-r1 HIGH
# findings (CVE-2026-107493, -107494, -121482, -124709, -84786 in libssl3/libcrypto3) for the first
# Docs Testing deployment and its dependencies (Identity, Control, Docs). Expires 2026-12-01T00:00:00Z.
# The product repositories' scan wrapper (.github/scripts/scan-image-testing.sh) decides which images
# may be published under it; this file keeps those images out of production and fails closed on expiry:
#
#   P-1  production pins no product image while this file exists (tests/test_dssl_exception.py, CI);
#   P-2  production never pins a digest listed below;
#   E-1  from the expiry on, a Testing `up` with a listed digest is refused (a `down` still plans);
#   T-1  the plan time (plantimestamp()) must be valid and not before the decision.
#
# Add every digest published under the exception here, with its source commit, in the same PR that pins
# it in envs/nonprod.tfvars. Removal (after OpenSSL 3.5.10 images pass the permanent gate): move every
# digest below to withdrawn-images.tf, then delete this file and modules/image-exception-guard, in one
# reviewed PR (report 2026-11-22-testing-temporary-openssl-acceptance, file 02).
locals {
  dssl_exception_expires_utc = "2026-12-01T00:00:00Z"

  dssl_testing_only_image_digests = {
    # "sha256:<64 hex>" = "munaxa-docs/api <commit>: D-SSL Testing-only"

    # Published 23 Nov 2026 (Y-1), pinned by Apply 1.
    "sha256:b69d9481e43269b5061e3f70a421a41b007bac0d3a0e17b49f8906fe78fd4caa" = "munaxa-identity/api 0b94951 (run 45167312831): D-SSL Testing-only"
    "sha256:f44593fa3f0021eb301f9270849cc7498012247b50cbf8a5e8dc586f14616462" = "munaxa-identity/migrate 0b94951 (run 45167312831): D-SSL Testing-only"
    # Published 24 Nov 2026 (Identity sign-in fix identity#28), pinned by the Identity re-pin; the
    # 0b94951 pair above is no longer pinned.
    "sha256:98d494ed016e6702e2bd4fee1533be0d672fcb322a14ea8cc6b4287d8324de1f" = "munaxa-identity/api 6dbf35d (run 45359411701): D-SSL Testing-only"
    "sha256:726ace441fd4a520c01ef3a92162059c92fc6ac267c83e627c62eb85990cc032" = "munaxa-identity/migrate 6dbf35d (run 45359411701): D-SSL Testing-only"
    # Published 25 Nov 2026, pinned by the combined re-pin (report 2026-11-25-combined-testing-rollout);
    # the 6dbf35d Identity pair above is no longer pinned.
    "sha256:d24ee375e3fced5f354b471548ee70ba686085cb90becd0e941545c60dce7277" = "munaxa-identity/api c721a8e (run 45692576016): D-SSL Testing-only"
    "sha256:05487060aed34395fd0e32958d01b1382b38c63cd4ee2ef1e0a8ed95b2370eef" = "munaxa-identity/migrate c721a8e (run 45692576016): D-SSL Testing-only"
    # Published 26 Nov 2026 by publish-images-testing.yml (run 45815404306, identity#31 page CSP fix),
    # pinned by the Identity re-pin (report 2026-11-25-control-login-redesign, file 01); the c721a8e
    # Identity pair above is no longer pinned.
    "sha256:cd3b3180a75778d04b1564f74eed8eea7e1622bbc21e72bae9ec4c66af7f09d9" = "munaxa-identity/api testing-7641300 (run 45815404306): D-SSL Testing-only"
    "sha256:760e16b3e28cf8eb89827988d39b7ebc1c81db8f9d3a33d8336b49eed27b295c" = "munaxa-identity/migrate testing-7641300 (run 45815404306): D-SSL Testing-only"
    "sha256:6c79f98ede5159aabae316ad2f29c5e85b99e6bc011265a16da4d75fb44f88f0" = "munaxa-control/api 744765d (run 45167349640): D-SSL Testing-only"
    "sha256:0ae0db81a6c1eb07068f8bb330379664f15ec3d4cbcadc519cf968082da723a9" = "munaxa-control/migrate 744765d (run 45167349640): D-SSL Testing-only"
    "sha256:752fea31c1f0ac6dbcdffc0d5d1bfcd0348eb84e5f7008aad77f645275f64ca6" = "munaxa-control/portal 744765d (run 45167349640): D-SSL Testing-only"
    # Published 25 Nov 2026 (control#18 + #16), pinned by the combined re-pin; the 744765d trio above
    # is no longer pinned.
    "sha256:885e694f175a4b7b4fd320b96188422f425ebba66fe49eccdc8d67d9fc57e0e7" = "munaxa-control/api 659c8b8 (run 45692524545): D-SSL Testing-only"
    "sha256:b871492f32224fabd144f5aeb38aab4c099b88415dd5319c0ddf4d3440a065f9" = "munaxa-control/migrate 659c8b8 (run 45692524545): D-SSL Testing-only"
    "sha256:030be8122e190c83eb5d085d55ab823880ee092e26465509f6baa29ec42df2b9" = "munaxa-control/portal 659c8b8 (run 45692524545): D-SSL Testing-only"

    # Published 23 Nov 2026 (Y-1), pinned by Apply 2. munaxa-docs/antivirus passed the permanent gate
    # and is not listed.
    "sha256:febeaca7bb1e58b261677c30cc4aabeec7d00896b40155f89ead903597be073d" = "munaxa-docs/api 9348aab (run 45167367972): D-SSL Testing-only"
    "sha256:28e22b96ada6237abef4f53470c1d13723bb70931ae8dfa774df8d536cbb48cd" = "munaxa-docs/web 9348aab (run 45167367972): D-SSL Testing-only"
    "sha256:4d00650b9759a64889cf2c95a3c10cb508787737af2d69aff64c23ba56e66ae8" = "munaxa-docs/migrate 9348aab (run 45167367972): D-SSL Testing-only"
    # Published 25 Nov 2026 (docs#184, #185, #187), pinned by the combined re-pin; the 9348aab trio above
    # is no longer pinned. The a523f44 images (run 45652258762) were never pinned.
    "sha256:9f8f474ae77f6655da697dddaa8cd18fec80ab592fa5d45105ed168192bbcedf" = "munaxa-docs/api cec7bcc (run 45692480226): D-SSL Testing-only"
    "sha256:b01dd00693778ca361f29e1e14ed31c387e3f8602ebcd6c1a5b6797f8293a061" = "munaxa-docs/web cec7bcc (run 45692480226): D-SSL Testing-only"
    "sha256:e174393d907f6202fe8457970ad2997601043033cffe1b01367c316fdf7d3f07" = "munaxa-docs/migrate cec7bcc (run 45692480226): D-SSL Testing-only"
    # Published 26 Nov 2026 by publish-images-testing.yml (run 45822198363; docs#189, #190, #191),
    # pinned by the Docs re-pin (report 2026-11-26-docs-library-tree); the cec7bcc trio above is no
    # longer pinned.
    "sha256:62a563cb84a020372ddc3370693c6f8556e16a635641276de949f15ba45dd693" = "munaxa-docs/api testing-75cdcc3 (run 45822198363): D-SSL Testing-only"
    "sha256:224bc621630dbc678b76439f6c3398245b2cdc9b2b5f3617c40e9f586a5153ee" = "munaxa-docs/web testing-75cdcc3 (run 45822198363): D-SSL Testing-only"
    "sha256:b5afba103ac07e7786ac92df6fc2e7a67941f5e54a53a05d968deec183c8c5c5" = "munaxa-docs/migrate testing-75cdcc3 (run 45822198363): D-SSL Testing-only"

    # Published 26 Nov 2026 by munaxa-work publish-images-testing.yml after green main CI on ad96f98
    # (work#61 Work exception, owner decision 26 Nov 12:35 UTC), pinned by the Work pin
    # (report 2026-11-26-work-testing-like-docs). First Work images on Testing.
    "sha256:2ea322011ab46b4d041ac3c4f35803835f39d1dfa7be282639f81f1485cb6be7" = "munaxa-work/api testing-ad96f98: D-SSL Testing-only"
    "sha256:6aee624db2573255b92f487d1e923dd2f3befa1c8266aaab8fac878c10f99517" = "munaxa-work/admin testing-ad96f98: D-SSL Testing-only"
    "sha256:ac693b0280c0a82a6923eea417817c70392e204daed3f7669ee13ee47fc1041a" = "munaxa-work/migrate testing-ad96f98: D-SSL Testing-only"
  }
}

module "dssl_exception_guard" {
  source = "../modules/image-exception-guard"

  environment          = var.environment
  expires_utc          = local.dssl_exception_expires_utc
  now_utc              = plantimestamp()
  sessions_running     = var.services_enabled || var.edge_enabled
  testing_only_digests = keys(local.dssl_testing_only_image_digests)
  images               = { for k, v in var.images : k => v }
}
