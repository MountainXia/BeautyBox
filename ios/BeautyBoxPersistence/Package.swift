// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BeautyBoxPersistence",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "BeautyBoxPersistence",
            targets: ["BeautyBoxPersistence"]
        ),
    ],
    dependencies: [
        .package(path: "../BeautyBoxCore"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.12.0"),
    ],
    targets: [
        .target(
            name: "BeautyBoxPersistence",
            dependencies: [
                .product(name: "BeautyBoxCore", package: "BeautyBoxCore"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .testTarget(
            name: "BeautyBoxPersistenceTests",
            dependencies: [
                "BeautyBoxPersistence",
                .product(name: "BeautyBoxCore", package: "BeautyBoxCore"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
    ]
)
