interface MigrationElement {
    code: string,
    type: string,
    category: string,
    msg: string,
    changeType? : string
}

interface MigrationData {
    removed : [
        MigrationElement
    ],
    added : [
        MigrationElement
    ],
    changed : [
        MigrationElement
    ]
}

interface MigrationDriverlibResolutionElement {
    code: string,
    type: string,
    peripheral: string,
    fix: string,
    fixMsg: string,
    compatible: string
}


interface MigrationDriverlibResolutionData {
    removed : MigrationDriverlibResolutionElement[],
    changed : MigrationDriverlibResolutionElement[]
}

interface FunctionMap {
	fromFunction : string;
	toFunction : string;
	fromArgs: string[];
}

interface ArgChange {
	code: string;
	fix: string;
}