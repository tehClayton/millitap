from PIL import Image, ImageDraw

GROUND=(27,36,48); RULE=(59,75,95); EARLY=(232,163,61); LATE=(79,163,199); TRUE=(127,203,143)

def make(size, rounded):
    S = size*4
    im = Image.new("RGBA", (S,S), (0,0,0,0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0,0,S-1,S-1], radius=int(S*0.22), fill=GROUND)
    else:
        d.rectangle([0,0,S-1,S-1], fill=GROUND)

    cy = S//2
    m  = int(S*0.16)
    # the zero line: the whole point of the app
    d.line([m, cy, S-m, cy], fill=TRUE, width=max(2,int(S*0.022)))

    r = int(S*0.070)
    # rushing dots sit above the line, dragging dots below
    for x, y, col in [
        (0.30, -0.175, EARLY),
        (0.47, -0.085, EARLY),
        (0.64,  0.105, LATE),
        (0.81,  0.205, LATE),
    ]:
        cx = int(S*x); cyy = cy + int(S*y)
        d.ellipse([cx-r, cyy-r, cx+r, cyy+r], fill=col)
    return im.resize((size,size), Image.LANCZOS)

make(180, False).save("apple-touch-icon.png")   # iOS applies its own mask
make(192, True).save("icon-192.png")
make(512, True).save("icon-512.png")
print("icons written")
