declare module 'textarea-caret' {
	interface CaretCoordinates {
		top: number;
		left: number;
		height: number;
	}
	function getCaretCoordinates(element: HTMLTextAreaElement | HTMLInputElement, position: number, options?: { debug?: boolean }): CaretCoordinates;
	export default getCaretCoordinates;
}
