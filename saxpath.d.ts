declare module "saxpath" {
    import type { SAXStream } from "sax"
    import type { Stream } from "node:stream"

    declare class SaXPath extends Stream {
        constructor(saxParser: SAXStream, xPath: string): void
    }

    export default class saxpath {
        SaXPath
    }
}
