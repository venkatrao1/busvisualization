{ pkgs }: {
    deps = [
        pkgs.python39Full
        pkgs.python39Packages.pandas
        pkgs.python39Packages.numpy
    ];
}