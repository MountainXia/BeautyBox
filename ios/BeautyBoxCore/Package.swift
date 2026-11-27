// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BeautyBoxCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "BeautyBoxCore",
            targets: ["BeautyBoxCore"]
        ),
    ],
    targets: [
        .target(
            name: "BeautyBoxCore"
        ),
        .testTarget(
            name: "BeautyBoxCoreTests",
            dependencies: ["BeautyBoxCore"]
        ),
    ]
)
