# Verification — 0.3.0

29 automated tests cover authentication/ownership prerequisites, archives and hashes, mod and resource dependency graphs (nested, pinned, shared, cyclic and conflicting), newest compatible selection, installation into the requested instance and rollback across mods/resourcepacks/shaderpacks.

25 UI checks cover launch prerequisites, four content tabs, build selection, automatic versions, Vanilla resource packs, shader instructions and layout at 1080px width. Packaged EXEs are checked with isolated data.

Real API/download verification: Iris with Sodium as a required dependency; Complementary Reimagined shader; Fresh Animations resource pack; Vic's Point Blank on Forge 1.20.1. Downloaded files were verified against Modrinth SHA-512 hashes. Vic's Point Blank in the tested API response had no required dependency entries; this does not assert that all runtime requirements can be inferred from its metadata.

The owner supplied Mojang's approval email on 2026-10-29 and confirmed Microsoft login and joining a multiplayer server. We did not automate the owner's personal login in this update. Not all Minecraft/loader combinations have been tested. Automatic newest selection may choose a beta/alpha when it is the newest compatible publication.
