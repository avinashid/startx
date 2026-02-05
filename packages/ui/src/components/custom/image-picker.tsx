import { GalleryHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { type ChangeEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from '@/components/ui/carousel';

import { cn } from '../lib/utils.js';
const ImagePicker = ({
	onChange,
	defaultValue,
	disabled,
	className,
}: {
	onChange?: (e: FileList | null) => void;
	defaultValue?: Blob;
	disabled?: boolean;
	className?: string;
}) => {
	const getDefaultImage = () => {
		try {
			if (!defaultValue) return '';
			return URL.createObjectURL(defaultValue);
		} catch (error) {
			return '';
		}
	};
	const [selectedImage, setSelectedImage] = useState<string[]>(
		getDefaultImage() ? [getDefaultImage()] : [],
	);

	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
		if (event.target.files?.[0]) {
			setSelectedImage(Array.from(event.target.files).map((file) => URL.createObjectURL(file)));
			const file = event.target.files;
			onChange?.(file);
		}
	};
	return (
		<div>
			<div className="flex items-start w-full aspect-video flex-col gap-2">
				<div
					onClick={() => fileInputRef.current?.click()}
					className={cn(
						'border-dashed grid place-content-center min-w-full aspect-video border border-gray-300 rounded-md overflow-hidden',
						className,
					)}
				>
					{selectedImage.length !== 0 ? (
						<Carousel>
							<CarouselContent>
								{selectedImage.map((image) => (
									<CarouselItem key={image}>
										<img
											alt={image}
											src={image}
											className="w-full h-full overflow-hidden object-contain transition-transform duration-500 ease-in-out"
										></img>
									</CarouselItem>
								))}
							</CarouselContent>
							{selectedImage.length > 1 && (
								<>
									<CarouselPrevious className="left-2" />
									<CarouselNext className="right-2" />
								</>
							)}
						</Carousel>
					) : (
						<div className="flex">
							<input
								type="file"
								ref={fileInputRef}
								id="imageInput"
								accept="image/*"
								onChange={handleImageChange}
								className="hidden"
								multiple
							/>
							<GalleryHorizontal className="text-gray-500 drop-shadow-lg " size={40} />
						</div>
					)}
				</div>
				<Button
					type="button"
					className="px-8 border-dotted"
					disabled={disabled}
					onClick={(e) => {
						// eslint-disable-next-line @typescript-eslint/no-unused-expressions
						selectedImage.length === 0 ? fileInputRef.current?.click() : setSelectedImage([]);
						onChange?.(null);
					}}
					variant={selectedImage.length > 0 ? 'destructive' : 'outline'}
				>
					{selectedImage.length === 0 ? 'Upload image' : 'Remove image'}
				</Button>
			</div>
		</div>
	);
};

export { ImagePicker };
