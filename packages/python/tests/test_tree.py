"""``get_wilaya_tree`` — the accessor that closes a cross-language trap.

Until it existed, ``by_wilaya`` meant two different things depending on which
package you were holding: in Python a **deprecated v1 shim returning a dict**,
in JavaScript the **v2 tree accessor**. Same name, same project. That is the
asymmetry ``shared/contract/`` exists to prevent, and it had been documented in
``llms.txt`` instead of fixed.

These tests pin the shape against the flat accessors rather than against
literals, so the tree cannot drift from the records it is built out of.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from algeria_wilayas_communes import (
    DairaSubtree,
    WilayaTree,
    get_communes_of_wilaya,
    get_dairas_of_wilaya,
    get_wilaya_tree,
    get_wilayas,
)


def test_returns_none_for_an_unknown_code_rather_than_raising() -> None:
    # The accessor layer's rule: singular lookups miss, they do not raise.
    assert get_wilaya_tree(99) is None
    assert get_wilaya_tree("99") is None
    assert get_wilaya_tree(0) is None


def test_accepts_int_and_str_like_every_other_accessor() -> None:
    assert get_wilaya_tree(19) == get_wilaya_tree("19")


def test_the_tree_agrees_with_the_flat_accessors_for_every_wilaya() -> None:
    """The strongest form: no wilaya may disagree with its own flat records."""
    for wilaya in get_wilayas():
        tree = get_wilaya_tree(wilaya.code)
        assert tree is not None, wilaya.code

        # Header fields are the wilaya's own.
        assert (tree.code, tree.code_text, tree.name) == (
            wilaya.code,
            wilaya.code_text,
            wilaya.name,
        )

        # Daïras: same ids, same order as the flat accessor.
        flat_dairas = get_dairas_of_wilaya(wilaya.code)
        assert [d.id for d in tree.dairas] == [d.id for d in flat_dairas]
        assert len(tree.dairas) == tree.daira_count == wilaya.daira_count

        # Communes: every commune of the wilaya appears exactly once, under the
        # daïra it names. This is what would break if the grouping used a stale
        # index or matched on name instead of id.
        from_tree = [c.id for d in tree.dairas for c in d.communes]
        from_flat = [c.id for c in get_communes_of_wilaya(wilaya.code)]
        assert sorted(from_tree) == sorted(from_flat)
        assert len(from_tree) == len(set(from_tree)), "a commune appeared twice"
        assert len(from_tree) == tree.commune_count == wilaya.commune_count
        for subtree in tree.dairas:
            for commune in subtree.communes:
                assert commune.daira == subtree.id
                assert commune.wilaya == wilaya.code


def test_it_hands_back_the_same_record_objects_not_copies() -> None:
    # The flat accessors hand out the memoised records; the tree regroups them
    # rather than rebuilding them, so identity must survive. A copy here would
    # mean a second resident copy of up to 1541 communes per call.
    tree = get_wilaya_tree(19)
    assert tree is not None
    flat = {c.id: c for c in get_communes_of_wilaya(19)}
    for subtree in tree.dairas:
        for commune in subtree.communes:
            assert commune is flat[commune.id]


def test_the_records_are_frozen() -> None:
    tree = get_wilaya_tree(19)
    assert tree is not None
    # FrozenInstanceError specifically, not a blind Exception: a plain
    # AttributeError would also pass and would mean the field had been renamed
    # rather than frozen.
    with pytest.raises(FrozenInstanceError):
        tree.code = 20  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        tree.dairas[0].name = tree.name  # type: ignore[misc]


def test_the_dataclasses_are_exported_so_a_caller_can_type_against_them() -> None:
    tree = get_wilaya_tree(19)
    assert isinstance(tree, WilayaTree)
    assert tree is not None
    assert isinstance(tree.dairas[0], DairaSubtree)


def test_it_is_distinct_from_the_deprecated_v1_by_wilaya_shim() -> None:
    """The whole reason this exists: v1's ``by_wilaya`` returns a dict."""
    from algeria_wilayas_communes import legacy

    v1 = legacy.by_wilaya(19)
    v2 = get_wilaya_tree(19)
    assert isinstance(v1, dict)
    assert not isinstance(v2, dict)
    # v1 speaks snake_case French keys; v2 speaks the v2 model.
    assert "nom_fr" in v1
    assert v2 is not None
    assert v2.name.fr == v1["nom_fr"]
