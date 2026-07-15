# Non-Goals

This page describes what Paralleax should not try to become. It complements the
MVP scope by protecting the long-term product direction from avoidable scope
creep.

## Not a Rendering Engine

Paralleax describes and evaluates narrative structure. It should not try to
become a full rendering engine for every target medium.

The editor may preview stories, and the reader may execute them, but specialized
rendering belongs to downstream applications, game engines, websites, video
players, or exported runtimes.

## Not a Game Engine Replacement

Paralleax should not replace Unity, Godot, Unreal, or custom game engines.

It may export or expose structured story data to those tools, but it should not
take ownership of physics, animation systems, asset pipelines, rendering loops,
or engine-specific runtime concerns.

## Not a General Programming Language

Paralleax should not become a general-purpose programming language. Conditions,
effects, variables, and future automation must stay author-facing and tied to
narrative needs.

If a future feature starts requiring arbitrary code execution to be useful, it
should be reconsidered.

## Not Coupled to One Canvas Library

React Flow is a useful editor canvas, but Paralleax should not encode React Flow
constraints into the narrative model.

The story model must remain portable if the editor later changes canvas
technology or implements a custom graph surface.

## Not a Universal Export Runtime

Paralleax may export stories or provide embeddable readers, but it should not
execute every format it can produce.

Exports should preserve structured story data and let target platforms handle
their own runtime-specific concerns.

## Not a Full Player Account System in the MVP

The MVP reader can execute a story, but it should not become a full player
account or save-management system yet.

Persisted play sessions and player saves can be explored after story persistence
and reader semantics are stable.

## Not a Content Translation System Yet

Interface internationalization is separate from translating user-authored story
content.

Story translation may be explored later, but it should not be assumed as part of
the MVP or interface internationalization work.
